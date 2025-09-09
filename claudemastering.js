// --- Reference Tracks ---
const REFERENCE_TRACKS2 = {
  JAZZ: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/n884ce4bb65d328ecb03c598409e2b168-79659fb3286c9ea31c4e6973da4f7f8e_r3tywn.mp3",
  AFROBEAT: "https://res.cloudinary.com/dozclei2n/video/upload/v1757219191/fast-rock-353534_gbhgxb.mp3",
  BLUES: "https://res.cloudinary.com/dozclei2n/video/upload/v1757082977/RetroFuture-Clean_chosic.com_p0kdyi.mp3",
  "GOSPEL WORSHIP": "https://res.cloudinary.com/dozclei2n/video/upload/v1757088423/Michael_W_Smith_-_Grace_CeeNaija.com__sgddlp.mp3",
  "GOSPEL PRAISE": "https://res.cloudinary.com/dozclei2n/video/upload/v1757087741/Frank_Edwards_-_Under_The_Canopy_CeeNaija.com__mmph2d.mp3", // fixed url typo!
  RAGGAE: "https://res.cloudinary.com/dozclei2n/video/upload/v1757218452/Patoranking_Celebrate_Me_9jaflaver.com__d6kghx.mp3",
  RNB: "https://res.cloudinary.com/dozclei2n/video/upload/v1757219016/smoke-143172_rognzf.mp3",
  HIGHLIFE: "https://res.cloudinary.com/dozclei2n/video/upload/v1757218457/Nathaniel_Bassey_-_TOBECHUKWU_Praise_God_Ft_Mercy_Chinwo_Blessed_CeeNaija.com__ilpuyo.mp3",
  RAP: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/T-Pain-Can-t-Believe-It-feat.-Lil-Wayne_weoni7.mp3",
  EDM: "https://res.cloudinary.com/dozclei2n/video/upload/v1757219019/dance-for-me-280006_kpyw5y.mp3",
  TRAP: "https://res.cloudinary.com/dozclei2n/video/upload/v1757088559/Kendrick_Lamar_-_HUMBLE_Offblogmedia.com_kmjpsb.mp3",
  POP: "https://res.cloudinary.com/dozclei2n/video/upload/v1757218455/eona-emotional-ambient-pop-351436_akdt0c.mp3",
  "ROCK & ROLL": "https://res.cloudinary.com/dozclei2n/video/upload/v1757219191/fast-rock-353534_gbhgxb.mp3"
};

async function fetchReferenceAudio2(genre) {
  const url = REFERENCE_TRACKS2[genre];
  if (!url) throw new Error("Reference audio not found for genre: " + genre);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch reference audio.");
  return await response.arrayBuffer();
}

async function readAudioFile2(file) {
  if (!file) throw new Error("No target audio file loaded.");
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

function computeFeatures2(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const length = channelData.length;
  const rms = Math.sqrt(channelData.reduce((sum, v) => sum + v * v, 0) / length);
  let peak = 0;
  for (let i = 0; i < channelData.length; i++) {
    const absVal = Math.abs(channelData[i]);
    if (absVal > peak) peak = absVal;
  }
  const mean = channelData.reduce((s, v) => s + v, 0) / length;
  const std = Math.sqrt(channelData.reduce((s, v) => Math.pow(v - mean, 2) + s, 0) / length);

  // FFT
  const fftSize = 8192;
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createBufferSource();
  src.buffer = audioBuffer;
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = fftSize;
  src.connect(analyser);
  src.start();
  return new Promise(resolve => {
    setTimeout(() => {
      const freqData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(freqData);
      // Spectral centroid
      let centroid = 0, total = 0;
      for (let i = 0; i < freqData.length; i++) {
        const v = Math.pow(10, freqData[i] / 10);
        centroid += i * v;
        total += v;
      }
      centroid = centroid / (total || 1);
      resolve({ rms, peak, std, freqData, spectralCentroid: centroid });
      audioCtx.close();
    }, 200);
  });
}

const WavEncoder2 = {
  encode({ sampleRate, channelData }) {
    const numChannels = channelData.length;
    const numSamples = channelData[0].length;
    const buffer = new ArrayBuffer(44 + numSamples * numChannels * 2);
    const view = new DataView(buffer);

    function writeString(v, offset, s) { for (let i = 0; i < s.length; ++i) v.setUint8(offset + i, s.charCodeAt(i)); }
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + numSamples * numChannels * 2, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, numSamples * numChannels * 2, true);
    let offset = 44;
    for (let i = 0; i < numSamples; ++i) {
      for (let c = 0; c < numChannels; ++c) {
        let sample = Math.max(-1, Math.min(1, channelData[c][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    return Promise.resolve(buffer);
  }
};

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

function makeMSNode(audioCtx, width) {
  // Not used in the main chain in this fix, but left for future use
  const splitter = audioCtx.createChannelSplitter(2);
  const merger = audioCtx.createChannelMerger(2);
  const mid = audioCtx.createGain();
  const side = audioCtx.createGain();
  mid.gain.value = 1;
  side.gain.value = width;
  splitter.connect(mid, 0);
  splitter.connect(mid, 1);
  splitter.connect(side, 0);
  splitter.connect(side, 1);

  const leftOut = audioCtx.createGain();
  const rightOut = audioCtx.createGain();

  mid.connect(leftOut);
  side.connect(leftOut);

  const sideInverter = audioCtx.createGain();
  sideInverter.gain.value = -1;
  side.connect(sideInverter);
  mid.connect(rightOut);
  sideInverter.connect(rightOut);

  leftOut.connect(merger, 0, 0);
  rightOut.connect(merger, 0, 1);
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

  const targetRMS = Math.sqrt(targetBuffer.getChannelData(0).reduce((sum, v) => sum + v * v, 0) / targetBuffer.length);
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = (referenceFeatures.rms / (targetRMS || 1)) * (userParams.gain || 1);

  function makeEQ(type, freq, gain) {
    const eq = audioCtx.createBiquadFilter();
    eq.type = type;
    eq.frequency.value = freq;
    eq.gain.value = gain;
    return eq;
  }
  const ref = referenceFeatures.freqData;
  const n = ref.length;
  const lowAvg = ref.slice(0, Math.floor(n * 0.15)).reduce((a, b) => a + b, 0) / Math.floor(n * 0.15);
  const midAvg = ref.slice(Math.floor(n * 0.15), Math.floor(n * 0.5)).reduce((a, b) => a + b, 0) / (Math.floor(n * 0.5) - Math.floor(n * 0.15));
  const highAvg = ref.slice(Math.floor(n * 0.5)).reduce((a, b) => a + b, 0) / (n - Math.floor(n * 0.5));
  const eqLow = makeEQ("lowshelf", 150, lowAvg / 10);
  const eqMid = makeEQ("peaking", 1000, midAvg / 10);
  const eqHigh = makeEQ("highshelf", 6000, highAvg / 10);

  const exciterNode = makeExciter(audioCtx, userParams.excitement || 1.5);
  const exciterHPF = audioCtx.createBiquadFilter();
  exciterHPF.type = 'highpass';
  exciterHPF.frequency.value = 4000;
  const exciterGain = audioCtx.createGain();
  exciterGain.gain.value = userParams.excitementGain || 0.1;

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

  // --- Connection Chain ---
  let lastNode = src;
  lastNode.connect(gainNode);
  lastNode = gainNode;

  if (noiseGate) {
    lastNode.connect(noiseGate);
    lastNode = noiseGate;
  }

  // Main path: EQ -> Compressor
  lastNode.connect(eqLow).connect(eqMid).connect(eqHigh).connect(comp);

  // Exciter path: tap after EQ, split and mix before output
  eqHigh.connect(exciterHPF);
  exciterHPF.connect(exciterNode);
  exciterNode.connect(exciterGain);

  // Merger: combine comp (main) and exciterGain (exciter) into two channels
  const merger = audioCtx.createChannelMerger(2);
  comp.connect(merger, 0, 0);        // main signal
  exciterGain.connect(merger, 0, 0); // add exciter to left
  exciterGain.connect(merger, 0, 1); // add exciter to right

  merger.connect(audioCtx.destination);

  src.start(0);
  const renderedBuffer = await audioCtx.startRendering();
  return renderedBuffer;
}
