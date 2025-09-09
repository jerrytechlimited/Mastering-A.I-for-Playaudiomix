// A new function for creating a simple exciter/saturator
function makeExciter(audioCtx, gain) {
  const exciter = audioCtx.createWaveShaper();
  const curve = new Float32Array(65536);
  const amount = gain;
  for (let i = 0; i < 65536; i++) {
    const x = (i * 2 / 65535) - 1;
    curve[i] = (1 + amount) * x / (1 + amount * Math.abs(x));
  }
  exciter.curve = curve;
  return exciter;
}

// A new function for M/S stereo processing
function makeMSNode(audioCtx, width) {
  const splitter = audioCtx.createChannelSplitter(2);
  const merger = audioCtx.createChannelMerger(2);

  // Left channel for mid
  const mid = audioCtx.createGain();
  // Right channel for side
  const side = audioCtx.createGain();
  side.gain.value = width;

  // M/S conversion
  splitter.connect(mid, 0);
  splitter.connect(mid, 1);
  splitter.connect(side, 0);
  splitter.connect(side, 1);

  // L/R from M/S
  const left = audioCtx.createGain();
  const right = audioCtx.createGain();
  left.gain.value = 1;
  right.gain.value = -1;

  mid.connect(left);
  mid.connect(right);
  side.connect(left);
  side.connect(right);

  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  return { splitter, merger };
}

async function applyMastering2(targetBuffer, referenceFeatures, userParams = {}) {
  const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    targetBuffer.numberOfChannels,
    targetBuffer.length,
    targetBuffer.sampleRate
  );
  const src = audioCtx.createBufferSource();
  src.buffer = targetBuffer;

  // RMS normalization + user gain
  const targetRMS = Math.sqrt(targetBuffer.getChannelData(0).reduce((sum, v) => sum + v*v, 0) / targetBuffer.length);
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = (referenceFeatures.rms / (targetRMS || 1)) * (userParams.gain || 1);

  // Multi-band EQ
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

  // Exciter
  const exciterNode = makeExciter(audioCtx, userParams.excitement || 1);
  const exciterHPF = audioCtx.createBiquadFilter();
  exciterHPF.type = 'highpass';
  exciterHPF.frequency.value = 4000;
  const exciterGain = audioCtx.createGain();
  exciterGain.gain.value = userParams.excitementGain || 0.1;

  // Compressor
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -20 + referenceFeatures.std * 10;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  // Noise reduction (simple gate)
  let noiseGate;
  if (userParams.noiseReduction && userParams.noiseReduction > 0) {
    noiseGate = audioCtx.createDynamicsCompressor();
    noiseGate.threshold.value = -60 + (userParams.noiseReduction * 30);
    noiseGate.ratio.value = 8;
    noiseGate.attack.value = 0.005;
    noiseGate.release.value = 0.1;
  }

  // Stereo width (Mid/Side processing)
  let stereoNode = null;
  if (userParams.stereoWidth !== undefined && targetBuffer.numberOfChannels > 1) {
    stereoNode = makeMSNode(audioCtx, userParams.stereoWidth);
  }

  // Connection chain
  let lastNode = gainNode;
  if (noiseGate) {
    lastNode.connect(noiseGate);
    lastNode = noiseGate;
  }
  lastNode.connect(eqLow).connect(eqMid).connect(eqHigh);
  const mainChain = eqHigh;

  // Parallel path for high-frequency excitement
  src.connect(exciterHPF);
  exciterHPF.connect(exciterNode);
  exciterNode.connect(exciterGain);

  const mainMerger = audioCtx.createChannelMerger(2);
  mainChain.connect(mainMerger, 0, 0);
  mainChain.connect(mainMerger, 0, 1);
  exciterGain.connect(mainMerger, 0, 0);
  exciterGain.connect(mainMerger, 0, 1);

  const compAndExciter = audioCtx.createDynamicsCompressor();
  compAndExciter.threshold.value = -20;
  compAndExciter.ratio.value = 4;
  mainMerger.connect(compAndExciter);

  if (stereoNode) {
    compAndExciter.connect(stereoNode.splitter);
    stereoNode.merger.connect(audioCtx.destination);
  } else {
    compAndExciter.connect(audioCtx.destination);
  }

  src.connect(gainNode);
  src.start();
  return audioCtx.startRendering();
}
