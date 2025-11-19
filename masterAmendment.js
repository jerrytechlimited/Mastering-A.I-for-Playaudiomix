// --- IMPORTANT ---
// Required scripts in this ORDER (in your HTML):
// <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.16.0/dist/tf.min.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/yamnet"></script>
// <script src="audio_mastering_yamnet_tfjs.js"></script>

// --- Reference Tracks: Replace ... with actual URLs! ---
const REFERENCE_TRACKS2 = {
  JAZZ: "...",
  AFROBEAT: "...",
  BLUES: "...",
  "GOSPEL WORSHIP": "...",
  "GOSPEL PRAISE": "...",
  RAGGAE: "...",
  RNB: "...",
  HIGHLIFE: "...",
  RAP: "...",
  EDM: "...",
  TRAP: "...",
  POP: "...",
  "ROCK & ROLL": "..."
};

// --- YamNet model loading ---
let yamnetModel = null;
let yamnetReady = false;

if (document.getElementById('status2')) {
  document.getElementById('status2').textContent = "Loading ML model...";
}

// Load the model when DOM is ready
window.addEventListener('DOMContentLoaded', async () => {
  try {
    yamnetModel = await yamnet.load();
    yamnetReady = true;
    if (document.getElementById('status2')) {
      document.getElementById('status2').textContent = "";
    }
    console.log("YamNet loaded:", yamnetModel);
  } catch (err) {
    if (document.getElementById('status2')) {
      document.getElementById('status2').textContent = "Error loading ML model: " + err.message;
    }
    console.error(err);
  }
});

// --- Audio Utility Functions ---
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

function bufferToMonoPcm(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  return channelData;
}

function resampleTo16kHz(input, inputSampleRate) {
  const outputSampleRate = 16000;
  const sampleRatio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(input.length / sampleRatio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; ++i) {
    const idx = i * sampleRatio;
    const idx0 = Math.floor(idx);
    const idx1 = Math.min(idx0 + 1, input.length - 1);
    output[i] = input[idx0] + (input[idx1] - input[idx0]) * (idx - idx0);
  }
  return output;
}

// --- ML-powered embedding using YamNet ---
async function getYamnetEmbedding(audioBuffer) {
  if (!yamnetModel) throw new Error("YamNet model not loaded yet!");
  let pcm = bufferToMonoPcm(audioBuffer);
  let sr = audioBuffer.sampleRate;
  if (sr !== 16000) {
    pcm = resampleTo16kHz(pcm, sr);
    sr = 16000;
  }
  // YamNet expects: tf.tensor1d, sampleRate=16000
  const inputTensor = tf.tensor1d(pcm);
  const result = await yamnetModel.predict(inputTensor, sr);
  // result.embeddings: tf.Tensor2d (frames, 1024)
  const meanEmbedding = result.embeddings.mean(0); // shape [1024]
  return await meanEmbedding.array();
}

function cosineSimilarity(a, b) {
  let dot = 0.0, normA = 0.0, normB = 0.0;
  for (let i = 0; i < a.length; ++i) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1e-8);
}

// --- Mastering chain (uses ML embedding average for gain/EQ as stub logic) ---
async function applyMastering2(targetBuffer, referenceEmbedding, userParams = {}) {
  const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    targetBuffer.numberOfChannels,
    targetBuffer.length,
    targetBuffer.sampleRate
  );
  const src = audioCtx.createBufferSource();
  src.buffer = targetBuffer;

  // Use the average of the embedding for gain/EQ as a demonstration
  const embeddingAvg = referenceEmbedding.reduce((sum, v) => sum + v, 0) / referenceEmbedding.length;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = embeddingAvg * (userParams.gain || 1);

  function makeEQ(type, freq, gain) {
    const eq = audioCtx.createBiquadFilter();
    eq.type = type; eq.frequency.value = freq; eq.gain.value = gain;
    return eq;
  }
  const eqLow = makeEQ("lowshelf", 150, embeddingAvg / 8);
  const eqMid = makeEQ("peaking", 1000, embeddingAvg / 10);
  const eqHigh = makeEQ("highshelf", 6000, embeddingAvg / 12);

  const comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -20 + embeddingAvg * 10;
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
  if (userParams.stereoWidth !== undefined && targetBuffer.numberOfChannels > 1) {
    const width = Math.max(0, Math.min(2, userParams.stereoWidth));
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

// --- WavEncoder as before ---
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

// --- Mastering Button logic ---
document.getElementById('processBtn2').onclick = async () => {
  const status = document.getElementById('status2');
  if (!yamnetReady) {
    status.textContent = "Please wait, ML model loading...";
    return;
  }
  const targetFile = document.getElementById('targetAudio2').files[0];
  const genreSelect = document.getElementById('genreSelect2');
  const selectedGenre = genreSelect.value;

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
    status.textContent = "Decoding reference track...";
    const referenceArrayBuffer = await fetchReferenceAudio2(selectedGenre);
    const refAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const referenceAudio = await refAudioCtx.decodeAudioData(referenceArrayBuffer);

    status.textContent = "Decoding target track...";
    const targetAudio = await readAudioFile2(targetFile);

    status.textContent = "Extracting ML features...";
    const referenceEmbedding = await getYamnetEmbedding(referenceAudio);
    const targetEmbedding = await getYamnetEmbedding(targetAudio);

    const similarity = cosineSimilarity(referenceEmbedding, targetEmbedding);
    let userParams = { gain: 1, noiseReduction: 0, stereoWidth: 1 };
    status.textContent = `Similarity (ml): ${similarity.toFixed(2)}. Mastering...`;

    let masteredBuffer = await applyMastering2(targetAudio, referenceEmbedding, userParams);

    window._mastering_temp = {
      targetAudio,
      referenceEmbedding,
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
    console.error(err);
  } finally {
    clearInterval(interval);
  }
}

// --- Download handler ---
async function prepareAndDownloadMasteredTrack() {
  try {
    const { targetAudio, referenceEmbedding } = window._mastering_temp;
    const params = getCurrentFXParams();
    document.getElementById('prepStatus2').textContent = "Preparing mastered track for download...";
    let buffer = await applyMastering2(targetAudio, referenceEmbedding, params);
    document.getElementById('prepStatus2').textContent = "Encoding audio file...";
    const wavData = await WavEncoder2.encode({
      sampleRate: buffer.sampleRate,
      channelData: Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
    });
    document.getElementById('prepStatus2').textContent = "Your download is starting...";
    const blob = new Blob([wavData], { type: "audio/wav" });
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

// --- Tips ---
// - Double check you have an element with id='status2' in your HTML for model load feedback.
// - Make sure TFJS and YamNet scripts are loaded before this file.
// - The reference tracks must be valid URLs!
// --- Payment Modal HTML Injection ---
function injectPaymentModals() {
  if (document.getElementById('payModal2')) return;

  // Create modal wrapper
  const payModal = document.createElement('div');
  payModal.id = 'payModal2';
  payModal.style = `
    display:none;
    position:fixed;
    z-index:10001;
    left:0;
    top:0;
    width:100vw;
    height:100vh;
    background:rgba(0,0,0,0.6);
    overflow:auto;
  `;

  // Modal content
  payModal.innerHTML = `
    <div style="
      background:#fff;
      padding:2em;
      max-width:400px;
      margin:10vh auto;
      border-radius:8px;
      box-shadow:0 4px 24px #222;
      overflow:auto;
    ">
      <h3 style="text-align:center;">Choose Payment</h3>
      <div style="margin:2em 0;display:flex;justify-content:space-between;gap:1em;flex-wrap:wrap;">
        <button id="paystackBtn2" style="
          flex:1;
          padding:10px;
          background:#0d6efd;
          color:#fff;
          border:none;
          border-radius:6px;
          cursor:pointer;
        ">
          <img src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhAZkdnfFm5lyRBdhsFSnUDUhYjZ8GL6zgHmP7DoDHzxuSusWMm58zs7uMIIZ5_kC_5BA4DRyx6cCSXuUkmNOC6Wzpmaa4PDh_AdIU0fkexvlhbAqWjfTVAsc7-iDNGQ2Rhz_93a4LzuzhnMGqpjo6coQOCj92F9woVQq19h4WxhoDr2t3pINxQekcT5JRZ/s320/paystack.png" width="100"/><br>
          Paystack
        </button>
        <div id="paypalBtn2" style="flex:1;overflow:auto;"></div>
      </div>
      <button id="payCancel2" style="
        width:100%;
        background-color:#000;
        color:#fff;
        padding:10px;
        border:none;
        border-radius:10px;
        cursor:pointer;
      ">Cancel</button>
    </div>
  `;

  const prepModal = document.createElement('div');
  prepModal.id = 'prepModal2';
  prepModal.style = `
    display:none;
    position:fixed;
    z-index:10002;
    left:0;
    top:0;
    width:100vw;
    height:100vh;
    background:rgba(0,0,0,0.4);
  `;
  prepModal.innerHTML = `
    <div style="background:#fff;padding:2em;max-width:350px;margin:20vh auto;border-radius:8px;box-shadow:0 4px 18px #222;">
      <h4>Please wait while your download is being prepared...</h4>
      <div id="prepSpinner2" style="margin:2em auto;text-align:center;">
        <span style="display:inline-block;width:32px;height:32px;border:4px solid #ccc;border-top:4px solid #007bff;border-radius:50%;animation:spin 1s linear infinite;"></span>
      </div>
      <p id="prepStatus2" style="margin-top:1em;">Your download will begin automatically once ready.</p>
    </div>
    <style>@keyframes spin {100% {transform: rotate(360deg);}}</style>
  `;

  document.body.appendChild(payModal);
  document.body.appendChild(prepModal);

  // Add event listeners
  document.getElementById('payCancel2').onclick = function () {
    document.getElementById('payModal2').style.display = 'none';
    document.body.style.overflow = ''; // Re-enable scroll
  };

  document.getElementById('paystackBtn2').onclick = function () {
    startPaystack();
  };
}

// --- Initialize modal ---
injectPaymentModals();

// --- Trigger Modal ---
document.getElementById('downloadLink2').onclick = function (e) {
  e.preventDefault();
  document.getElementById('payModal2').style.display = 'block';
  document.body.style.overflow = 'hidden'; // Prevent body scroll when modal is open
  renderPaypalButton();
};

// --- PayPal Button Rendering ---
function renderPaypalButton() {
  if (document.getElementById('paypalBtn2').children.length) return;
  paypal.Buttons({
    style: {
      layout: 'vertical',
      color: 'blue',
      shape: 'rect',
      label: 'paypal'
    },
    createOrder: function (data, actions) {
      return actions.order.create({
        purchase_units: [{ amount: { value: '4' } }]
      });
    },
    onApprove: function (data, actions) {
      return actions.order.capture().then(function (details) {
        document.getElementById('payModal2').style.display = 'none';
        document.body.style.overflow = '';
        paymentConfirmed('paypal', details);
      });
    },
    onError: function (err) {
      alert("Paypal error: " + err);
    },
    onCancel: function () {
      alert("Paypal payment cancelled.");
    }
  }).render('#paypalBtn2');
}

// --- Paystack Function ---
function startPaystack() {
  let email = prompt("Enter your email to proceed with payment (Paystack):", "");
  if (!email) {
    alert("Payment cancelled. Email required.");
    return;
  }
  let amount = 500 * 1000; // ₦5000 in kobo

  let handler = PaystackPop.setup({
    key: 'pk_live_656d3f492c531cc4599abaa10d424d6ac8313954',
    email: email,
    amount: amount,
    currency: "NGN",
    ref: 'master_' + Math.floor(Math.random() * 1000000000),
    label: "Mastered Track Download",
    callback: function (response) {
      document.getElementById('payModal2').style.display = 'none';
      document.body.style.overflow = '';
      paymentConfirmed('paystack', response);
    },
    onClose: function () {
      alert('Payment window closed. Please try again to proceed.');
    }
  });
  handler.openIframe();
}

// --- Payment Confirmation ---
function paymentConfirmed(platform, details) {
  document.getElementById('prepModal2').style.display = 'block';
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
