// --- Reference Tracks ---
// ... (Existing code unchanged, not repeated for brevity)

// --- Exciter Effect ---
function createExciterNode(audioCtx, amount = 0.5, freq = 3000) {
  const input = audioCtx.createGain();
  const hp = audioCtx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = freq;
  hp.Q.value = 0.707;

  const waveshaper = audioCtx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; ++i) {
    const x = (i - 128) / 128;
    curve[i] = Math.tanh(x * 2.5);
  }
  waveshaper.curve = curve;
  waveshaper.oversample = '4x';

  const mix = audioCtx.createGain();
  mix.gain.value = amount;
  const output = audioCtx.createGain();
  output.gain.value = 1;

  input.connect(hp).connect(waveshaper).connect(mix);
  mix.connect(output);
  input.connect(output); // dry
  return { input, output, setAmount: (a) => { mix.gain.value = a; } };
}

// --- Plate Reverb Effect ---
function createPlateReverbNode(audioCtx, duration = 2.0, decay = 2.5, mix = 0.2) {
  const input = audioCtx.createGain();
  const convolver = audioCtx.createConvolver();
  convolver.buffer = createPlateImpulse(audioCtx, duration, decay);
  const wetGain = audioCtx.createGain();
  wetGain.gain.value = mix;
  const dryGain = audioCtx.createGain();
  dryGain.gain.value = 1 - mix;

  input.connect(convolver).connect(wetGain);
  input.connect(dryGain);

  const output = audioCtx.createGain();
  wetGain.connect(output);
  dryGain.connect(output);

  function updateReverb({ mix: m, decay: d, duration: t }) {
    if (m !== undefined) wetGain.gain.value = m, dryGain.gain.value = 1 - m;
    if (d || t) {
      convolver.buffer = createPlateImpulse(audioCtx, t || duration, d || decay);
    }
  }
  return { input, output, updateReverb };
}

function createPlateImpulse(audioCtx, duration = 2.0, decay = 2.5) {
  const rate = audioCtx.sampleRate;
  const length = Math.floor(duration * rate);
  const buffer = audioCtx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; ++c) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; ++i) {
      const t = i / rate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * t / decay) * (1 - 0.14 * Math.sin(2 * Math.PI * 1.3 * t));
    }
  }
  return buffer;
}

// --- Apply Mastering (with Exciter and Plate Reverb) ---
async function applyMastering2(targetBuffer, referenceFeatures, userParams = {}) {
  const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    targetBuffer.numberOfChannels,
    targetBuffer.length,
    targetBuffer.sampleRate
  );
  const src = audioCtx.createBufferSource();
  src.buffer = targetBuffer;

  const targetRMS = Math.sqrt(targetBuffer.getChannelData(0).reduce((sum, v) => sum + v*v, 0) / targetBuffer.length);
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = (referenceFeatures.rms / (targetRMS || 1)) * (userParams.gain || 1);

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

  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -20 + referenceFeatures.std * 10;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  let noiseGate;
  if (userParams.noiseReduction && userParams.noiseReduction > 0) {
    noiseGate = audioCtx.createDynamicsCompressor();
    noiseGate.threshold.value = -60 + (userParams.noiseReduction * 30);
    noiseGate.ratio.value = 8;
    noiseGate.attack.value = 0.005;
    noiseGate.release.value = 0.1;
  }

  let stereoNode = null;
  if (userParams.stereoWidth !== undefined) {
    const width = Math.max(0, Math.min(2, userParams.stereoWidth));
    if (targetBuffer.numberOfChannels > 1) {
      const splitter = audioCtx.createChannelSplitter(2);
      const merger = audioCtx.createChannelMerger(2);
      const leftGain = audioCtx.createGain();
      const rightGain = audioCtx.createGain();

      leftGain.gain.value = width;
      rightGain.gain.value = width;

      splitter.connect(leftGain, 0);
      splitter.connect(rightGain, 1);

      leftGain.connect(merger, 0, 0);
      rightGain.connect(merger, 0, 1);

      stereoNode = {splitter, merger, leftGain, rightGain};
    }
  }

  // --- Exciter Node ---
  const exciterAmount = userParams.exciterAmount !== undefined ? userParams.exciterAmount : 0.3;
  const exciterFreq = userParams.exciterFreq !== undefined ? userParams.exciterFreq : 3500;
  const exciter = createExciterNode(audioCtx, exciterAmount, exciterFreq);

  // --- Plate Reverb Node ---
  const reverbMix = userParams.reverbMix !== undefined ? userParams.reverbMix : 0.13;
  const reverbDuration = userParams.reverbDuration !== undefined ? userParams.reverbDuration : 1.7;
  const reverbDecay = userParams.reverbDecay !== undefined ? userParams.reverbDecay : 2.5;
  const plateReverb = createPlateReverbNode(audioCtx, reverbDuration, reverbDecay, reverbMix);

  let lastNode = gainNode;
  if (noiseGate) {
    lastNode.connect(noiseGate);
    lastNode = noiseGate;
  }
  lastNode.connect(eqLow).connect(eqMid).connect(eqHigh);

  eqHigh.connect(exciter.input);
  lastNode = exciter.output;

  lastNode.connect(comp);
  lastNode = comp;

  lastNode.connect(plateReverb.input);
  lastNode = plateReverb.output;

  if (stereoNode) {
    lastNode.connect(stereoNode.splitter);
    stereoNode.leftGain.connect(stereoNode.merger, 0, 0);
    stereoNode.rightGain.connect(stereoNode.merger, 0, 1);
    stereoNode.merger.connect(audioCtx.destination);
  } else {
    lastNode.connect(audioCtx.destination);
  }

  src.connect(gainNode);
  src.start();
  return audioCtx.startRendering();
}

// --- Realtime FX Chain (add exciter and reverb live preview) ---
function makeRealtimeFXChain(buffer, params) {
  fxCtx2 = new (window.AudioContext || window.webkitAudioContext)();
  fxSource2 = fxCtx2.createBufferSource();
  fxSource2.buffer = buffer;

  fxGain2 = fxCtx2.createGain();
  fxGain2.gain.value = params.gain || 1;

  if (params.noiseReduction && params.noiseReduction > 0) {
    fxNoise2 = fxCtx2.createDynamicsCompressor();
    fxNoise2.threshold.value = -60 + (params.noiseReduction * 30);
    fxNoise2.ratio.value = 8;
    fxNoise2.attack.value = 0.005;
    fxNoise2.release.value = 0.1;
  } else {
    fxNoise2 = null;
  }

  if (typeof params.stereoWidth !== "undefined" && buffer.numberOfChannels > 1) {
    fxSplitter2 = fxCtx2.createChannelSplitter(2);
    fxMerger2 = fxCtx2.createChannelMerger(2);
    fxLeftGain2 = fxCtx2.createGain();
    fxRightGain2 = fxCtx2.createGain();
    fxLeftGain2.gain.value = Math.max(0, Math.min(2, params.stereoWidth));
    fxRightGain2.gain.value = Math.max(0, Math.min(2, params.stereoWidth));
  } else {
    fxSplitter2 = fxMerger2 = fxLeftGain2 = fxRightGain2 = null;
  }

  // --- FX Exciter and Plate Reverb for live preview ---
  const exciterAmount = params.exciterAmount !== undefined ? params.exciterAmount : 0.3;
  const exciterFreq = params.exciterFreq !== undefined ? params.exciterFreq : 3500;
  const exciter = createExciterNode(fxCtx2, exciterAmount, exciterFreq);

  const reverbMix = params.reverbMix !== undefined ? params.reverbMix : 0.13;
  const reverbDuration = params.reverbDuration !== undefined ? params.reverbDuration : 1.7;
  const reverbDecay = params.reverbDecay !== undefined ? params.reverbDecay : 2.5;
  const plateReverb = createPlateReverbNode(fxCtx2, reverbDuration, reverbDecay, reverbMix);

  let last = fxSource2;
  last.connect(fxGain2);
  last = fxGain2;
  if (fxNoise2) { last.connect(fxNoise2); last = fxNoise2; }

  last.connect(exciter.input);
  last = exciter.output;
  last.connect(plateReverb.input);
  last = plateReverb.output;

  if (fxSplitter2 && fxLeftGain2 && fxRightGain2 && fxMerger2) {
    last.connect(fxSplitter2);
    fxSplitter2.connect(fxLeftGain2, 0);
    fxSplitter2.connect(fxRightGain2, 1);
    fxLeftGain2.connect(fxMerger2, 0, 0);
    fxRightGain2.connect(fxMerger2, 0, 1);
    last = fxMerger2;
  }
  last.connect(fxCtx2.destination);
}

// --- Get FX Params (now with exciter and reverb) ---
function getCurrentFXParams() {
  return {
    gain: parseFloat(document.getElementById('gainControl2').value),
    noiseReduction: parseFloat(document.getElementById('noiseReduction2').value),
    stereoWidth: parseFloat(document.getElementById('stereoWidth2').value),
    exciterAmount: parseFloat(document.getElementById('exciterAmount2')?.value ?? 0.3),
    exciterFreq: parseFloat(document.getElementById('exciterFreq2')?.value ?? 3500),
    reverbMix: parseFloat(document.getElementById('reverbMix2')?.value ?? 0.13),
    reverbDuration: parseFloat(document.getElementById('reverbDuration2')?.value ?? 1.7),
    reverbDecay: parseFloat(document.getElementById('reverbDecay2')?.value ?? 2.5)
  }
}

// --- Add listeners for UI controls (exciter/reverb) ---
['gainControl2','noiseReduction2','stereoWidth2','exciterAmount2','exciterFreq2','reverbMix2','reverbDuration2','reverbDecay2'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      if (fxBuffer2 && fxIsPlaying2) playFX2(getFXCurrentTime2());
      else if (fxBuffer2) updateFXUI2();
    });
  }
});

// --- The rest of your code remains unchanged ---
