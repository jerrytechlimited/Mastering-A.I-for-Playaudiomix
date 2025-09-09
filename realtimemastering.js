// --- Exciter Helper ---
function makeExciter(audioCtx, amount = 1.4) {
  // Waveshaper for gentle distortion
  const shaper = audioCtx.createWaveShaper();
  const curve = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) {
    let x = (i * 2 / 65535) - 1;
    // Gentle saturation
    curve[i] = Math.tanh(amount * x);
  }
  shaper.curve = curve;
  return shaper;
}

// --- Stereo Widener Helper ---
function makeStereoWidener(audioCtx, width = 1.3) {
  // Mid/side matrix
  const splitter = audioCtx.createChannelSplitter(2);
  const merger = audioCtx.createChannelMerger(2);

  const mid = audioCtx.createGain();
  const side = audioCtx.createGain();
  const sideInverter = audioCtx.createGain();
  sideInverter.gain.value = -1;

  // Mid: L+R / 2; Side: (L-R) * width / 2
  splitter.connect(mid, 0); // L
  splitter.connect(mid, 1); // R
  splitter.connect(side, 0); // L
  splitter.connect(sideInverter, 1); // R
  sideInverter.connect(side);

  // Output Left: Mid + Side
  const outL = audioCtx.createGain();
  mid.connect(outL);
  side.connect(outL).gain.value = width;
  // Output Right: Mid - Side
  const outR = audioCtx.createGain();
  mid.connect(outR);
  side.connect(outR).gain.value = -width;

  outL.connect(merger, 0, 0);
  outR.connect(merger, 0, 1);

  return {splitter, merger};
}

// --- Revised Mastering Function ---
async function applyMastering2(targetBuffer, referenceFeatures, userParams = {}) {
  const channelCount = targetBuffer.numberOfChannels;
  const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    channelCount, targetBuffer.length, targetBuffer.sampleRate
  );
  const src = audioCtx.createBufferSource();
  src.buffer = targetBuffer;

  // RMS normalization
  const targetRMS = Math.sqrt(targetBuffer.getChannelData(0).reduce((sum, v) => sum + v*v, 0) / targetBuffer.length);
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = (referenceFeatures.rms / (targetRMS || 1)) * (userParams.gain || 1);

  // EQ
  function makeEQ(type, freq, gain) {
    const eq = audioCtx.createBiquadFilter();
    eq.type = type; eq.frequency.value = freq; eq.gain.value = gain;
    return eq;
  }
  const ref = referenceFeatures.freqData;
  const n = ref.length;
  const lowAvg = ref.slice(0, Math.floor(n * 0.15)).reduce((a,b)=>a+b,0) / Math.floor(n * 0.15);
  const midAvg = ref.slice(Math.floor(n * 0.15), Math.floor(n * 0.5)).reduce((a,b)=>a+b,0) / (Math.floor(n * 0.5)-Math.floor(n * 0.15));
  const highAvg = ref.slice(Math.floor(n * 0.5)).reduce((a,b)=>a+b,0) / (n-Math.floor(n * 0.5));
  const eqLow = makeEQ("lowshelf", 150, lowAvg/10);
  const eqMid = makeEQ("peaking", 1000, midAvg/10);
  const eqHigh = makeEQ("highshelf", 6000, highAvg/10);

  // Compressor
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -20 + referenceFeatures.std * 10;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  // Exciter (high end boost, parallel path)
  // Add a touch more by default; amount and mix can be tweaked
  const exciterHPF = audioCtx.createBiquadFilter();
  exciterHPF.type = "highpass";
  exciterHPF.frequency.value = 3500;
  const exciterNode = makeExciter(audioCtx, 1.5);
  const exciterGain = audioCtx.createGain();
  exciterGain.gain.value = 0.14; // subtle mix amount

  // Stereo widener (after comp+exciter merged)
  let stereoWidener = null;
  if (userParams.stereoWidth !== undefined && channelCount > 1) {
    stereoWidener = makeStereoWidener(audioCtx, userParams.stereoWidth || 1.3);
  }

  // Chain: src -> gain -> (noiseGate) -> eq -> comp -> main
  //                                     \-> exciter -> exciterGain -> main
  let lastNode = gainNode;
  // Optionally add noise gate
  if (userParams.noiseReduction && userParams.noiseReduction > 0) {
    const noiseGate = audioCtx.createDynamicsCompressor();
    noiseGate.threshold.value = -60 + (userParams.noiseReduction * 30);
    noiseGate.ratio.value = 8;
    noiseGate.attack.value = 0.005;
    noiseGate.release.value = 0.1;
    lastNode.connect(noiseGate);
    lastNode = noiseGate;
  }

  // EQ + main comp path
  lastNode.connect(eqLow).connect(eqMid).connect(eqHigh).connect(comp);

  // Exciter path: tap after EQ
  eqHigh.connect(exciterHPF);
  exciterHPF.connect(exciterNode);
  exciterNode.connect(exciterGain);

  // Merge: sum comp (main) and exciter gain (parallel)
  const merger = audioCtx.createChannelMerger(channelCount);

  // Main comp output to all channels
  for (let ch = 0; ch < channelCount; ++ch) {
    comp.connect(merger, 0, ch);
    exciterGain.connect(merger, 0, ch);
  }

  if (stereoWidener) {
    merger.connect(stereoWidener.splitter);
    stereoWidener.merger.connect(audioCtx.destination);
  } else {
    merger.connect(audioCtx.destination);
  }

  src.connect(gainNode);
  src.start();
  return audioCtx.startRendering();
}

// --- Download Button: Add Feedback ---
const downloadLink = document.getElementById('downloadLink2');
downloadLink.onclick = async function(e) {
  e.preventDefault();
  const status = document.getElementById('status2');
  status.textContent = "Preparing mastered download..."; // show preparing message

  try {
    const params = getCurrentFXParams();
    // Optionally you can show a progress bar/spinner here
    let buffer = await applyMastering2(window._mastering_temp.targetAudio, window._mastering_temp.referenceFeatures, params);
    const wavData = await WavEncoder2.encode({
      sampleRate: buffer.sampleRate,
      channelData: Array.from({length: buffer.numberOfChannels}, (_, i) => buffer.getChannelData(i))
    });
    const blob = new Blob([wavData], {type: "audio/wav"});
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = "Mastered.wav";
    downloadLink.click();
    status.textContent = "Download ready!";
  } catch (err) {
    status.textContent = "Download failed: " + err.message;
  }
};
