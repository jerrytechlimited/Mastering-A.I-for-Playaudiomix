// --- Reference Tracks ---
const REFERENCE_TRACKS2 = {
  JAZZ: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/n884ce4bb65d328ecb03c598409e2b168-79659fb3286c9ea31c4e6973da4f7f8e_r3tywn.mp3",
  AFROBEAT: "https://res.cloudinary.com/dozclei2n/video/upload/v1757219191/fast-rock-353534_gbhgxb.mp3",
  BLUES: "https://res.cloudinary.com/dozclei2n/video/upload/v1757082977/RetroFuture-Clean_chosic.com_p0kdyi.mp3",
  "GOSPEL WORSHIP": "https://res.cloudinary.com/dozclei2n/video/upload/v1757088423/Michael_W_Smith_-_Grace_CeeNaija.com__sgddlp.mp3",
  "GOSPEL PRAISE": "https://res.cloudinary.com/dozclei2n/video/upload/v1757087741/Frank_Edwards_-_Under_The_Canopy_CeeNaija.com__mmph2d.mp3",
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
  const std = Math.sqrt(channelData.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / length);

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

    function writeString(v, offset, s) {
      for (let i = 0; i < s.length; ++i) v.setUint8(offset + i, s.charCodeAt(i));
    }
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

// ---------- Mastering Pipeline ----------
async function applyMastering2(targetBuffer, referenceFeatures, userParams = {}) {
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
  let exciter = null;
  if (userParams.exciter && userParams.exciter > 0) {
    exciter = audioCtx.createWaveShaper();
    const amount = Math.min(1, Math.max(0, userParams.exciter));
    const curve = new Float32Array(44100);
    for (let i = 0; i < 44100; i++) {
      const x = (i / 44100) * 2 - 1;
      curve[i] = Math.tanh(x * (1 + amount * 10));
    }
    exciter.curve = curve;
    exciter.oversample = "4x";

    const exciterEQ = audioCtx.createBiquadFilter();
    exciterEQ.type = "highshelf";
    exciterEQ.frequency.value = 3000;
    exciterEQ.gain.value = amount * 6;

    exciter.connect(exciterEQ);
    exciter = exciterEQ;
  }

  // Compressor
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -20 + referenceFeatures.std * 10;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  // Noise gate
  let noiseGate;
  if (userParams.noiseReduction && userParams.noiseReduction > 0) {
    noiseGate = audioCtx.createDynamicsCompressor();
    noiseGate.threshold.value = -60 + (userParams.noiseReduction * 30);
    noiseGate.ratio.value = 8;
    noiseGate.attack.value = 0.005;
    noiseGate.release.value = 0.1;
  }

  // Stereo width
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

  // Connection chain
  let lastNode = gainNode;
  if (noiseGate) { lastNode.connect(noiseGate); lastNode = noiseGate; }
  lastNode.connect(eqLow).connect(eqMid).connect(eqHigh);
  if (exciter) { lastNode.connect(exciter); lastNode = exciter; }
  lastNode.connect(comp);

  if (stereoNode) {
    comp.connect(stereoNode.splitter);
    stereoNode.leftGain.connect(stereoNode.merger, 0, 0);
    stereoNode.rightGain.connect(stereoNode.merger, 0, 1);
    stereoNode.merger.connect(audioCtx.destination);
  } else {
    comp.connect(audioCtx.destination);
  }

  src.connect(gainNode);
  src.start();
  return audioCtx.startRendering();
}

// ---------- Realtime FX Player ----------
// (same structure as your original but includes exciter in makeRealtimeFXChain)

function makeRealtimeFXChain(buffer, params) {
  fxCtx2 = new (window.AudioContext || window.webkitAudioContext)();
  fxSource2 = fxCtx2.createBufferSource();
  fxSource2.buffer = buffer;

  fxGain2 = fxCtx2.createGain();
  fxGain2.gain.value = params.gain || 1;

  // Noise Reduction
  if (params.noiseReduction && params.noiseReduction > 0) {
    fxNoise2 = fxCtx2.createDynamicsCompressor();
    fxNoise2.threshold.value = -60 + (params.noiseReduction * 30);
    fxNoise2.ratio.value = 8;
    fxNoise2.attack.value = 0.005;
    fxNoise2.release.value = 0.1;
  } else {
    fxNoise2 = null;
  }

  // Exciter
  let fxExciter = null;
  if (params.exciter && params.exciter > 0) {
    fxExciter = fxCtx2.createWaveShaper();
    const amount = Math.min(1, Math.max(0, params.exciter));
    const curve = new Float32Array(44100);
    for (let i = 0; i < 44100; i++) {
      const x = (i / 44100) * 2 - 1;
      curve[i] = Math.tanh(x * (1 + amount * 10));
    }
    fxExciter.curve = curve;
    fxExciter.oversample = "4x";

    const fxExciterEQ = fxCtx2.createBiquadFilter();
    fxExciterEQ.type = "highshelf";
    fxExciterEQ.frequency.value = 3000;
    fxExciterEQ.gain.value = amount * 6;

    fxExciter.connect(fxExciterEQ);
    fxExciter = fxExciterEQ;
  }

  // Stereo Width
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

  let last = fxSource2;
  last.connect(fxGain2); last = fxGain2;
  if (fxNoise2) { last.connect(fxNoise2); last = fxNoise2; }
  if (fxExciter) { last.connect(fxExciter); last = fxExciter; }
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

// ---------- Utilities ----------
function getCurrentFXParams() {
  return {
    gain: parseFloat(document.getElementById('gainControl2').value),
    noiseReduction: parseFloat(document.getElementById('noiseReduction2').value),
    stereoWidth: parseFloat(document.getElementById('stereoWidth2').value),
    exciter: parseFloat(document.getElementById('exciterControl2').value)
  }
}

// Add exciter slider in HTML:
// <label>Exciter:
//   <input id="exciterControl2" type="range" min="0" max="1" step="0.01" value="0.3">
//   <span id="exciterVal2">0.3</span>
// </label>

// Add it to control listeners:
['gainControl2','noiseReduction2','stereoWidth2','exciterControl2'].forEach(id =>
  document.getElementById(id).addEventListener('input', () => {
    document.getElementById('gainVal2').innerText = document.getElementById('gainControl2').value;
    document.getElementById('noiseVal2').innerText = document.getElementById('noiseReduction2').value;
    document.getElementById('widthVal2').innerText = document.getElementById('stereoWidth2').value;
    document.getElementById('exciterVal2').innerText = document.getElementById('exciterControl2').value;
    if (fxBuffer2 && fxIsPlaying2) playFX2(getFXCurrentTime2());
    else if (fxBuffer2) updateFXUI2();
  })
);
