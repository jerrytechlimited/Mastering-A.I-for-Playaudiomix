async function applyMastering2(targetBuffer, referenceFeatures, userParams = {}) {
  const exciterAmount = (userParams.exciterAmount !== undefined) ? userParams.exciterAmount : 0.1; // 0.05-0.2 is subtle
  const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    targetBuffer.numberOfChannels,
    targetBuffer.length,
    targetBuffer.sampleRate
  );
  const src = audioCtx.createBufferSource();
  src.buffer = targetBuffer;

  // Gain for RMS normalization + user gain
  const targetRMS = Math.sqrt(targetBuffer.getChannelData(0).reduce((sum, v) => sum + v*v, 0) / targetBuffer.length);
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = (referenceFeatures.rms / (targetRMS || 1)) * (userParams.gain || 1);

  // Multi-band EQ: Low, Mid, High bands
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

  // Compressor for dynamic range
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

  // --- EXCITER CHAIN ---
  // 1. Highpass (4kHz) -> 2. Simple waveshaper -> 3. Gain (exciterAmount)
  const exciterHPF = audioCtx.createBiquadFilter();
  exciterHPF.type = "highpass";
  exciterHPF.frequency.value = 4000;

  const exciterWS = audioCtx.createWaveShaper();
  // Simple "tape" saturation curve
  const curve = new Float32Array(65536);
  for (let i = 0; i < 65536; i++) {
    const x = (i * 2 / 65535) - 1;
    curve[i] = Math.tanh(2 * x);
  }
  exciterWS.curve = curve;
  exciterWS.oversample = '4x';

  const exciterGain = audioCtx.createGain();
  exciterGain.gain.value = exciterAmount;

  // --- Main Processing Chain ---
  let lastNode = gainNode;
  if (noiseGate) {
    lastNode.connect(noiseGate);
    lastNode = noiseGate;
  }
  lastNode.connect(eqLow).connect(eqMid).connect(eqHigh).connect(comp);

  // --- Exciter branch: Tap after main EQ (before comp) ---
  eqHigh.connect(exciterHPF);
  exciterHPF.connect(exciterWS);
  exciterWS.connect(exciterGain);

  // --- Merger: Add exciter to main output ---
  // For mono, just sum; for stereo, sum both to each side
  const merger = audioCtx.createChannelMerger(targetBuffer.numberOfChannels);

  comp.connect(merger, 0, 0); // main to L
  if (targetBuffer.numberOfChannels > 1)
    comp.connect(merger, 1, 1); // main to R

  // Exciter into all channels
  exciterGain.connect(merger, 0, 0);
  if (targetBuffer.numberOfChannels > 1)
    exciterGain.connect(merger, 0, 1);

  merger.connect(audioCtx.destination);

  src.connect(gainNode);
  src.start();
  return audioCtx.startRendering();
}
