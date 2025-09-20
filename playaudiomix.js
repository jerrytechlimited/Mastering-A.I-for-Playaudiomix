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
  encode({sampleRate, channelData}) {
    const numChannels = channelData.length;
    const numSamples = channelData[0].length;
    const buffer = new ArrayBuffer(44 + numSamples * numChannels * 2);
    const view = new DataView(buffer);

    function writeString(v, offset, s) { for (let i=0; i<s.length; ++i) v.setUint8(offset+i, s.charCodeAt(i)); }
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
    for (let i=0; i<numSamples; ++i) {
      for (let c=0; c<numChannels; ++c) {
        let sample = Math.max(-1, Math.min(1, channelData[c][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    return Promise.resolve(buffer);
  }
};

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

  let lastNode = gainNode;
  if (noiseGate) {
    lastNode.connect(noiseGate);
    lastNode = noiseGate;
  }
  lastNode.connect(eqLow).connect(eqMid).connect(eqHigh).connect(comp);

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

// --- Target player: NO FX ---
let targetCtx2 = null, targetSource2 = null;
let targetBuffer2 = null, targetIsPlaying2 = false, targetStartTime2 = 0, targetOffset2 = 0, targetDuration2 = 0, targetAnimFrame2 = null;
function clearTargetFX2() {
  if (targetSource2) { try { targetSource2.stop(); } catch{} }
  if (targetCtx2) { try { targetCtx2.close(); } catch{} }
  targetCtx2 = targetSource2 = null;
  targetIsPlaying2 = false;
  targetStartTime2 = 0;
  targetDuration2 = 0;
  if (targetAnimFrame2) cancelAnimationFrame(targetAnimFrame2);
  targetAnimFrame2 = null;
}
function playTargetFX2(startAt = 0) {
  if (!targetBuffer2) return;
  pauseFX2(true);
  clearTargetFX2();
  targetCtx2 = new (window.AudioContext || window.webkitAudioContext)();
  targetSource2 = targetCtx2.createBufferSource();
  targetSource2.buffer = targetBuffer2;
  targetIsPlaying2 = true;
  targetOffset2 = startAt || 0;
  targetDuration2 = targetBuffer2.duration;
  targetSource2.connect(targetCtx2.destination);
  targetSource2.start(0, targetOffset2);
  targetStartTime2 = targetCtx2.currentTime;
  document.getElementById('targetPlayPause2').textContent = "⏸";
  updateTargetUI2();

  targetSource2.onended = () => {
    targetIsPlaying2 = false;
    document.getElementById('targetPlayPause2').textContent = "▶";
    cancelAnimationFrame(targetAnimFrame2);
    targetAnimFrame2 = null;
  };
}
function pauseTargetFX2(silent) {
  if (!targetIsPlaying2) return;
  if (targetSource2) {
    try { targetSource2.stop(); } catch {}
  }
  targetOffset2 = getTargetCurrentTime2();
  targetIsPlaying2 = false;
  document.getElementById('targetPlayPause2').textContent = "▶";
  cancelAnimationFrame(targetAnimFrame2);
  targetAnimFrame2 = null;
  if (!silent) pauseFX2(true);
}
function seekTargetFX2(time) {
  targetOffset2 = time;
  if (targetIsPlaying2) playTargetFX2(time);
  else updateTargetUI2(time);
}
function getTargetCurrentTime2() {
  if (!targetIsPlaying2) return targetOffset2;
  return (targetCtx2.currentTime - targetStartTime2) + targetOffset2;
}
function updateTargetUI2(forceTime) {
  const duration = targetDuration2 || (targetBuffer2 && targetBuffer2.duration) || 0;
  const current = typeof forceTime === "number" ? forceTime : getTargetCurrentTime2();
  document.getElementById('targetTime2').textContent =
    `${formatTime(current)} / ${formatTime(duration)}`;
  let percent = duration ? Math.min(100, (current / duration) * 100) : 0;
  document.getElementById('targetProgressFill2').style.width = percent + "%";
  if (targetIsPlaying2) targetAnimFrame2 = requestAnimationFrame(updateTargetUI2);
}

// --- Mastered output player: FX applied ---
let fxCtx2 = null, fxSource2 = null, fxGain2 = null, fxNoise2 = null, fxSplitter2 = null, fxLeftGain2 = null, fxRightGain2 = null, fxMerger2 = null;
let fxBuffer2 = null, fxIsPlaying2 = false, fxStartTime2 = 0, fxOffset2 = 0, fxDuration2 = 0, fxAnimFrame2 = null;
function clearFX2() {
  if (fxSource2) { try { fxSource2.stop(); } catch{} }
  if (fxCtx2) { try { fxCtx2.close(); } catch{} }
  fxCtx2 = fxSource2 = fxGain2 = fxNoise2 = fxSplitter2 = fxLeftGain2 = fxRightGain2 = fxMerger2 = null;
  fxIsPlaying2 = false;
  fxStartTime2 = 0;
  fxDuration2 = 0;
  if (fxAnimFrame2) cancelAnimationFrame(fxAnimFrame2);
  fxAnimFrame2 = null;
}
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

  let last = fxSource2;
  last.connect(fxGain2);
  last = fxGain2;
  if (fxNoise2) { last.connect(fxNoise2); last = fxNoise2; }
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
function playFX2(startAt = 0) {
  if (!fxBuffer2) return;
  pauseTargetFX2(true);
  clearFX2();
  const params = getCurrentFXParams();
  makeRealtimeFXChain(fxBuffer2, params);
  fxIsPlaying2 = true;
  fxOffset2 = startAt || 0;
  fxDuration2 = fxBuffer2.duration;
  fxSource2.start(0, fxOffset2);
  fxStartTime2 = fxCtx2.currentTime;
  document.getElementById('fxPlayPause2').textContent = "⏸";
  updateFXUI2();

  fxSource2.onended = () => {
    fxIsPlaying2 = false;
    document.getElementById('fxPlayPause2').textContent = "▶";
    cancelAnimationFrame(fxAnimFrame2);
    fxAnimFrame2 = null;
  };
}
function pauseFX2(silent) {
  if (!fxIsPlaying2) return;
  if (fxSource2) {
    try { fxSource2.stop(); } catch {}
  }
  fxOffset2 = getFXCurrentTime2();
  fxIsPlaying2 = false;
  document.getElementById('fxPlayPause2').textContent = "▶";
  cancelAnimationFrame(fxAnimFrame2);
  fxAnimFrame2 = null;
  if (!silent) pauseTargetFX2(true);
}
function seekFX2(time) {
  fxOffset2 = time;
  if (fxIsPlaying2) playFX2(time);
  else updateFXUI2(time);
}
function getFXCurrentTime2() {
  if (!fxIsPlaying2) return fxOffset2;
  return (fxCtx2.currentTime - fxStartTime2) + fxOffset2;
}
function updateFXUI2(forceTime) {
  const duration = fxDuration2 || (fxBuffer2 && fxBuffer2.duration) || 0;
  const current = typeof forceTime === "number" ? forceTime : getFXCurrentTime2();
  document.getElementById('fxTime2').textContent =
    `${formatTime(current)} / ${formatTime(duration)}`;
  let percent = duration ? Math.min(100, (current / duration) * 100) : 0;
  document.getElementById('fxProgressFill2').style.width = percent + "%";
  if (fxIsPlaying2) fxAnimFrame2 = requestAnimationFrame(updateFXUI2);
}

// --- Utilities ---
function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${Math.floor(sec/60)}:${('0'+(sec%60)).slice(-2)}`;
}
function getCurrentFXParams() {
  return {
    gain: parseFloat(document.getElementById('gainControl2').value),
    noiseReduction: parseFloat(document.getElementById('noiseReduction2').value),
    stereoWidth: parseFloat(document.getElementById('stereoWidth2').value)
  }
}

// --- Load Target Audio ---
document.getElementById("targetAudio2").addEventListener("change", async function(e) {
  const file = e.target.files[0];
  if (!file) return;
  targetBuffer2 = await readAudioFile2(file);
  targetDuration2 = targetBuffer2.duration;
  document.getElementById('targetPlayerSection2').style.display = "";
  document.getElementById('targetPlayPause2').disabled = false;
  seekTargetFX2(0);
  updateTargetUI2(0);
});

// --- Mastering Button ---
document.getElementById('processBtn2').onclick = async () => {
  const targetFile = document.getElementById('targetAudio2').files[0];
  const genreSelect = document.getElementById('genreSelect2');
  const selectedGenre = genreSelect.value;
  const status = document.getElementById('status2');
  status.textContent = "Processing...";
  document.getElementById('outputPlayerSection2').style.display = "none";
  document.getElementById('downloadLink2').style.display = "none";
  document.getElementById('controlsSection2').style.display = "none";
  if (!targetFile || !selectedGenre) {
    status.textContent = "Please upload a target audio file and select a reference genre.";
    return;
  }

  let percent = 0;
  const bar = document.getElementById("progressBar2");
  const text = document.getElementById("progressText2");
  bar.style.width = "0%";
  text.textContent = "0%";
  const interval = setInterval(() => {
    percent += 5;
    if (percent > 90) clearInterval(interval);
    bar.style.width = percent + "%";
    text.textContent = percent + "%";
  }, 200);

  try {
    const referenceArrayBuffer = await fetchReferenceAudio2(selectedGenre);
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const referenceAudio = await audioCtx.decodeAudioData(referenceArrayBuffer);
    const targetAudio = await readAudioFile2(targetFile);

    const referenceFeatures = await computeFeatures2(referenceAudio);

    let userParams = { gain: 1, noiseReduction: 0, stereoWidth: 1 };
    let masteredBuffer = await applyMastering2(targetAudio, referenceFeatures, userParams);

    window._mastering_temp = {
      targetAudio,
      referenceFeatures,
      masteredBuffer
    };
    fxBuffer2 = masteredBuffer;
    fxDuration2 = masteredBuffer.duration;

    document.getElementById('outputPlayerSection2').style.display = "";
    document.getElementById('fxPlayPause2').disabled = false;
    document.getElementById('downloadLink2').style.display = "inline-block";
    document.getElementById('controlsSection2').style.display = "block";
    bar.style.width = "100%";
    text.textContent = "100%";
    status.textContent = "Mastering complete! Adjust final controls and play preview.";

    clearFX2();
    seekFX2(0);
    updateFXUI2(0);

  } catch (err) {
    status.textContent = "Error: " + err.message;
    bar.style.width = "0%";
    text.textContent = "0%";
  } finally {
    clearInterval(interval);
  }
}

// --- Player Controls ---
document.getElementById('targetPlayPause2').onclick = function() {
  if (!targetBuffer2) return;
  if (targetIsPlaying2) pauseTargetFX2();
  else playTargetFX2(targetOffset2);
};
document.getElementById('fxPlayPause2').onclick = function() {
  if (!fxBuffer2) return;
  if (fxIsPlaying2) pauseFX2();
  else playFX2(fxOffset2);
};
document.getElementById('targetProgressBar2').onclick = function(e) {
  if (!targetBuffer2) return;
  const rect = this.getBoundingClientRect();
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const seekTime = (targetBuffer2.duration || 0) * percent;
  seekTargetFX2(seekTime);
  if (targetIsPlaying2) playTargetFX2(seekTime);
};
document.getElementById('fxProgressBar2').onclick = function(e) {
  if (!fxBuffer2) return;
  const rect = this.getBoundingClientRect();
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const seekTime = (fxBuffer2.duration || 0) * percent;
  seekFX2(seekTime);
  if (fxIsPlaying2) playFX2(seekTime);
};
['gainControl2','noiseReduction2','stereoWidth2'].forEach(id =>
  document.getElementById(id).addEventListener('input', () => {
    document.getElementById('gainVal2').innerText = document.getElementById('gainControl2').value;
    document.getElementById('noiseVal2').innerText = document.getElementById('noiseReduction2').value;
    document.getElementById('widthVal2').innerText = document.getElementById('stereoWidth2').value;
    if (fxBuffer2 && fxIsPlaying2) playFX2(getFXCurrentTime2());
    else if (fxBuffer2) updateFXUI2();
  })
);

// --- Payment Modal HTML Injection ---
function injectPaymentModals() {
  if (document.getElementById('payModal2')) return;
  const payModal = document.createElement('div');
  payModal.id = 'payModal2';
  payModal.style = 'display:none;position:fixed;z-index:10001;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);';
  payModal.innerHTML = `
    <div style="background:#fff;padding:2em;max-width:400px;margin:10vh auto;border-radius:8px;box-shadow:0 4px 24px #222;">
      <h3 style = "text-align:center">Choose Payment</h3>
      <div style="margin:2em 0;display:flex;justify-content:space-between;">
        <span id="paystackBtn2" style="flex:1;margin-right:1em;">
        <img src = "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhAZkdnfFm5lyRBdhsFSnUDUhYjZ8GL6zgHmP7DoDHzxuSusWMm58zs7uMIIZ5_kC_5BA4DRyx6cCSXuUkmNOC6Wzpmaa4PDh_AdIU0fkexvlhbAqWjfTVAsc7-iDNGQ2Rhz_93a4LzuzhnMGqpjo6coQOCj92F9woVQq19h4WxhoDr2t3pINxQekcT5JRZ/s320/paystack.png"/>
        Paystack</span>
        <div id="paypalBtn2" style="flex:1;"></div>
      </div>
      <button id="payCancel2" style="width:100%">Cancel</button>
    </div>
  `;
  const prepModal = document.createElement('div');
  prepModal.id = 'prepModal2';
  prepModal.style = 'display:none;position:fixed;z-index:10002;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);';
  prepModal.innerHTML = `
    <div style="background:#fff;padding:2em;max-width:350px;margin:20vh auto;border-radius:8px;box-shadow:0 4px 18px #222;">
      <h4>Please wait while your download is being prepared...</h4>
      <div id="prepSpinner2" style="margin:2em auto;text-align:center;">
        <span style="display:inline-block;width:32px;height:32px;border:4px solid #ccc;border-top:4px solid #007bff;border-radius:50%;animation:spin 1s linear infinite;"></span>
      </div>
      <p id="prepStatus2" style="margin-top:1em;">Your download will begin automatically once ready.</p>
    </div>
    <style>
      @keyframes spin { 100% { transform: rotate(360deg); } }
    </style>
  `;
  document.body.appendChild(payModal);
  document.body.appendChild(prepModal);
}
injectPaymentModals();

document.getElementById('downloadLink2').onclick = function(e) {
  e.preventDefault();
  document.getElementById('payModal2').style.display = '';
  renderPaypalButton();
};
document.getElementById('payCancel2').onclick = function() {
  document.getElementById('payModal2').style.display = 'none';
};
document.getElementById('paystackBtn2').onclick = function() {
  startPaystack();
};
function renderPaypalButton() {
  if (document.getElementById('paypalBtn2').children.length) return;
  paypal.Buttons({
    style: {
      layout: 'vertical',
      color:  'blue',
      shape:  'rect',
      label:  'paypal'
    },
    createOrder: function(data, actions) {
      return actions.order.create({
        purchase_units: [{
          amount: { value: '4' } // $10.00 USD, change as needed!
        }]
      });
    },
    onApprove: function(data, actions) {
      return actions.order.capture().then(function(details) {
        document.getElementById('payModal2').style.display = 'none';
        paymentConfirmed('paypal', details);
      });
    },
    onError: function(err) {
      alert("Paypal error: " + err);
    },
    onCancel: function() {
      alert("Paypal payment cancelled.");
    }
  }).render('#paypalBtn2');
}
function startPaystack() {
  let email = prompt("Enter your email to proceed with payment (Paystack):", "user@example.com");
  if (!email) {
    alert("Payment cancelled. Email required.");
    document.getElementById('payModal2').style.display = '';
    return;
  }
  let amount = 50000 // Amount in kobo (₦5000)
  let handler = PaystackPop.setup({
    key: 'pk_test_7051b3225597c778f3523710e74ac5da75022fe2',
    email: email,
    amount: amount,
    currency: "NGN",
    ref: 'master_' + Math.floor(Math.random()*1000000000),
    label: "Mastered Track Download",
    callback: function(response) {
      document.getElementById('payModal2').style.display = 'none';
      paymentConfirmed('paystack', response);
    },
    onClose: function() {
      alert('Payment window closed. Please try again to proceed.');
      document.getElementById('payModal2').style.display = '';
    }
  });
  handler.openIframe();
}
function paymentConfirmed(platform, details) {
  document.getElementById('prepModal2').style.display = '';
  document.getElementById('prepStatus2').textContent = "Your download will begin automatically once ready.";
  prepareAndDownloadMasteredTrack();
}
async function prepareAndDownloadMasteredTrack() {
  try {
    const {targetAudio, referenceFeatures} = window._mastering_temp;
    const params = getCurrentFXParams();
    document.getElementById('prepStatus2').textContent = "Preparing mastered track for download...";
    let buffer = await applyMastering2(targetAudio, referenceFeatures, params);
    document.getElementById('prepStatus2').textContent = "Encoding audio file...";
    const wavData = await WavEncoder2.encode({
      sampleRate: buffer.sampleRate,
      channelData: Array.from({length: buffer.numberOfChannels}, (_, i) => buffer.getChannelData(i))
    });
    document.getElementById('prepStatus2').textContent = "Your download is starting...";
    const blob = new Blob([wavData], {type: "audio/wav"});
    const url = URL.createObjectURL(blob);
    const tmpLink = document.createElement('a');
    tmpLink.href = url;
    tmpLink.download = "mastered_track.wav";
    document.body.appendChild(tmpLink);
    tmpLink.click();
    tmpLink.remove();
    setTimeout(() => {
      document.getElementById('prepModal2').style.display = 'none';
    }, 2000);
  } catch (err) {
    document.getElementById('prepStatus2').textContent = "Error preparing download: " + err.message;
    setTimeout(() => {
      document.getElementById('prepModal2').style.display = 'none';
    }, 4000);
  }
}

/*
-------------------------
REQUIRED IN YOUR HTML:
-------------------------
<script src="https://js.paystack.co/v1/inline.js"></script>
<script src="https://www.paypal.com/sdk/js?client-id=AZ_EW2Q9G-3VsiQYs8XaQsh0VUxPj_2cb2HBoSSUYie4PEmC2PLe1hfT-IcipBeRYygXwnnpOL00o6pY&currency=USD"></script>
-------------------------
*/
