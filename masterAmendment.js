// === Reference Tracks ===
const REFERENCE_TRACKS2 = {
  JAZZ: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/jazz.mp3",
  AFROBEAT: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/afrobeat.mp3",
  BLUES: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/blues.mp3",
  "GOSPEL WORSHIP": "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/gospel_worship.mp3",
  "GOSPEL PRAISE": "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/gospel_praise.mp3",
  RAGGAE: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/raggae.mp3",
  RNB: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/rnb.mp3",
  HIGHLIFE: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/highlife.mp3",
  RAP: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/rap.mp3",
  EDM: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/edm.mp3",
  TRAP: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/trap.mp3",
  POP: "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/pop.mp3",
  "ROCK & ROLL": "https://res.cloudinary.com/dozclei2n/video/upload/v1757087501/rock.mp3"
};

// === Utility Functions ===
async function fetchReferenceAudio2(genre) {
  const url = REFERENCE_TRACKS2[genre];
  const resp = await fetch(url);
  const arrayBuffer = await resp.arrayBuffer();
  const ctx = new AudioContext();
  return ctx.decodeAudioData(arrayBuffer);
}

function readAudioFile2(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const ctx = new AudioContext();
      try {
        const buf = await ctx.decodeAudioData(e.target.result);
        resolve(buf);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// === WAV Exporter ===
const WavEncoder2 = {
  encode: function (audioBuffer) {
    const nCh = audioBuffer.numberOfChannels;
    const len = audioBuffer.length * nCh * 2 + 44;
    const buf = new ArrayBuffer(len);
    const view = new DataView(buf);
    let offset = 0;

    function writeStr(s) {
      for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
    }
    function write32(v) {
      view.setUint32(offset, v, true);
      offset += 4;
    }
    function write16(v) {
      view.setUint16(offset, v, true);
      offset += 2;
    }

    writeStr("RIFF");
    write32(len - 8);
    writeStr("WAVE");
    writeStr("fmt ");
    write32(16);
    write16(1);
    write16(nCh);
    write32(audioBuffer.sampleRate);
    write32(audioBuffer.sampleRate * nCh * 2);
    write16(nCh * 2);
    write16(16);
    writeStr("data");
    write32(audioBuffer.length * nCh * 2);

    const interleaved = new Float32Array(audioBuffer.length * nCh);
    for (let ch = 0; ch < nCh; ch++) {
      interleaved.set(audioBuffer.getChannelData(ch), ch);
    }
    for (let i = 0; i < interleaved.length; i++) {
      const s = Math.max(-1, Math.min(1, interleaved[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return buf;
  }
};

// === DSP Blocks (No Reverb) ===
function normalizeGain(audioCtx, input, targetDb = -14) {
  const analyser = audioCtx.createAnalyser();
  input.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);

  const rms = Math.sqrt(buf.reduce((a, b) => a + b * b, 0) / buf.length);
  const curDb = 20 * Math.log10(rms);
  const gainVal = Math.pow(10, (targetDb - curDb) / 20);

  const gain = audioCtx.createGain();
  gain.gain.value = gainVal;
  input.connect(gain);
  return gain;
}

function createEQ(audioCtx, settings = {}) {
  const low = audioCtx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 200;
  low.gain.value = settings.low || 0;

  const mid = audioCtx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 1;
  mid.gain.value = settings.mid || 0;

  const high = audioCtx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 5000;
  high.gain.value = settings.high || 0;

  low.connect(mid);
  mid.connect(high);
  return { input: low, output: high };
}

function createCompressor(audioCtx, settings = {}) {
  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = settings.threshold ?? -24;
  comp.knee.value = settings.knee ?? 30;
  comp.ratio.value = settings.ratio ?? 12;
  comp.attack.value = settings.attack ?? 0.003;
  comp.release.value = settings.release ?? 0.25;
  return comp;
}

function createStereoWidener(audioCtx, width = 0.5) {
  const split = audioCtx.createChannelSplitter(2);
  const merge = audioCtx.createChannelMerger(2);
  const gL = audioCtx.createGain();
  const gR = audioCtx.createGain();
  gL.gain.value = 1 + width;
  gR.gain.value = 1 - width;
  split.connect(gL, 0);
  split.connect(gR, 1);
  gL.connect(merge, 0, 0);
  gR.connect(merge, 0, 1);
  return { input: split, output: merge };
}

function createNoiseGate(audioCtx, threshold = -50) {
  const analyser = audioCtx.createAnalyser();
  const gain = audioCtx.createGain();
  function loop() {
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((a, b) => a + b * b, 0) / buf.length);
    const db = 20 * Math.log10(rms);
    gain.gain.value = db < threshold ? 0 : 1;
    requestAnimationFrame(loop);
  }
  loop();
  return { input: analyser, output: gain };
}

function createExciter(audioCtx, amount = 0.5) {
  const waveShaper = audioCtx.createWaveShaper();
  const curve = new Float32Array(65536);
  for (let i = 0; i < 65536; ++i) {
    const x = (i - 32768) / 32768;
    curve[i] = Math.tanh(amount * 10 * x) / Math.tanh(amount * 10);
  }
  waveShaper.curve = curve;
  waveShaper.oversample = "4x";
  return { input: waveShaper, output: waveShaper };
}

// === Mastering Process ===
async function applyMastering2(audioBuffer, settings = {}) {
  const ctx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  const src = ctx.createBufferSource();
  src.buffer = audioBuffer;

  let node = normalizeGain(ctx, src, settings.targetDb ?? -14);
  const eq = createEQ(ctx, settings.eq || {});
  node.connect(eq.input);
  node = eq.output;
  const comp = createCompressor(ctx, settings.comp || {});
  node.connect(comp);
  node = comp;
  const gate = createNoiseGate(ctx, settings.gate || -50);
  node.connect(gate.input);
  node = gate.output;
  const exc = createExciter(ctx, settings.exciter || 0.5);
  node.connect(exc.input);
  node = exc.output;
  const stereo = createStereoWidener(ctx, settings.stereo || 0.5);
  node.connect(stereo.input);
  node = stereo.output;

  node.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

// === Paystack + Download Flow ===
function payWithPaystack(amount, email, onSuccess) {
  var handler = PaystackPop.setup({
    key: "pk_test_xxxxxxxxxxxxxxxxxxxxxx", // replace with your public key
    email: email,
    amount: amount * 100, // kobo
    currency: "NGN",
    callback: function (response) {
      onSuccess(response);
    },
    onClose: function () {
      alert("Payment window closed.");
    }
  });
  handler.openIframe();
}

// === Main Download Logic ===
async function processAndDownload(file, email) {
  document.getElementById("downloadStatus").innerText =
    "Preparing your mastered track... Please wait.";
  const audioBuffer = await readAudioFile2(file);
  const mastered = await applyMastering2(audioBuffer, {
    eq: { low: 3, mid: -1, high: 2 },
    comp: { threshold: -20, ratio: 3 },
    gate: -45,
    exciter: 0.6,
    stereo: 0.4
  });

  const wav = WavEncoder2.encode(mastered);
  const blob = new Blob([wav], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "mastered_track.wav";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  document.getElementById("downloadStatus").innerText = "Download complete ✅";
}

// === Hook Button ===
document.getElementById("downloadBtn").addEventListener("click", function () {
  const fileInput = document.getElementById("uploadAudio");
  const email = document.getElementById("userEmail").value;
  if (!fileInput.files.length) {
    alert("Please upload a file first.");
    return;
  }
  const file = fileInput.files[0];

  // Open Terms modal first
  const modal = document.getElementById("termsModal");
  modal.style.display = "block";

  document.getElementById("agreeTerms").onclick = function () {
    modal.style.display = "none";
    payWithPaystack(2000, email, () => {
      processAndDownload(file, email);
    });
  };
});
