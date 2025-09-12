  let audioBuffer = null;
    let fxCtx2, fxSource2;
    let fxIsPlaying2 = false;
    let renderedBuffer = null;

    // Upload handler
    document.getElementById('fileInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new AudioContext();
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      alert("Audio loaded successfully!");
    });

    // FX Params
    function getCurrentFXParams() {
      return {
        gain: parseFloat(document.getElementById('gainControl2').value),
        noiseReduction: parseFloat(document.getElementById('noiseReduction2').value),
        stereoWidth: parseFloat(document.getElementById('stereoWidth2').value),
        exciter: parseFloat(document.getElementById('exciterControl2').value),
        reverb: parseFloat(document.getElementById('reverbControl2').value)
      }
    }

    // Generate Plate Reverb IR
    function generatePlateIR(ctx, duration = 2.5) {
      const rate = ctx.sampleRate;
      const length = rate * duration;
      const impulse = ctx.createBuffer(2, length, rate);
      for (let c = 0; c < 2; c++) {
        const ch = impulse.getChannelData(c);
        for (let i = 0; i < length; i++) {
          ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        }
      }
      return impulse;
    }

    // Realtime FX Preview
    function makeRealtimeFXChain(buffer, params) {
      fxCtx2 = new (window.AudioContext || window.webkitAudioContext)();
      fxSource2 = fxCtx2.createBufferSource();
      fxSource2.buffer = buffer;

      const gainNode = fxCtx2.createGain();
      gainNode.gain.value = params.gain;

      let last = fxSource2;
      last.connect(gainNode);
      last = gainNode;

      // Noise reduction
      if (params.noiseReduction > 0) {
        const comp = fxCtx2.createDynamicsCompressor();
        comp.threshold.value = -60 + (params.noiseReduction * 30);
        comp.ratio.value = 8;
        comp.attack.value = 0.005;
        comp.release.value = 0.1;
        last.connect(comp);
        last = comp;
      }

      // Exciter
      if (params.exciter > 0) {
        const highpass = fxCtx2.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 2000;
        const shaper = fxCtx2.createWaveShaper();
        const curve = new Float32Array(44100);
        for (let i = 0; i < curve.length; i++) {
          let x = (i / curve.length) * 2 - 1;
          curve[i] = Math.tanh(x * (params.exciter * 5));
        }
        shaper.curve = curve;
        highpass.connect(shaper);
        last.connect(highpass);
        shaper.connect(fxCtx2.destination);
      }

      // Stereo Width
      if (buffer.numberOfChannels > 1) {
        const splitter = fxCtx2.createChannelSplitter(2);
        const merger = fxCtx2.createChannelMerger(2);
        const lGain = fxCtx2.createGain();
        const rGain = fxCtx2.createGain();
        lGain.gain.value = params.stereoWidth;
        rGain.gain.value = params.stereoWidth;
        last.connect(splitter);
        splitter.connect(lGain, 0);
        splitter.connect(rGain, 1);
        lGain.connect(merger, 0, 0);
        rGain.connect(merger, 0, 1);
        last = merger;
      }

      // Plate Reverb
      if (params.reverb > 0) {
        const convolver = fxCtx2.createConvolver();
        convolver.buffer = generatePlateIR(fxCtx2, 2.5);
        const rvGain = fxCtx2.createGain();
        rvGain.gain.value = params.reverb;
        last.connect(convolver);
        convolver.connect(rvGain).connect(fxCtx2.destination);
      }

      last.connect(fxCtx2.destination);

      fxSource2.start();
      fxIsPlaying2 = true;

      fxSource2.onended = () => { fxIsPlaying2 = false; };
    }

    // Offline Render
    async function applyMastering2(buffer, params) {
      const ctx = new OfflineAudioContext(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate
      );

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      gainNode.gain.value = params.gain;

      let last = source;
      last.connect(gainNode);
      last = gainNode;

      // Noise reduction
      if (params.noiseReduction > 0) {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -60 + (params.noiseReduction * 30);
        comp.ratio.value = 8;
        comp.attack.value = 0.005;
        comp.release.value = 0.1;
        last.connect(comp);
        last = comp;
      }

      // Exciter
      if (params.exciter > 0) {
        const highpass = ctx.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 2000;
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(44100);
        for (let i = 0; i < curve.length; i++) {
          let x = (i / curve.length) * 2 - 1;
          curve[i] = Math.tanh(x * (params.exciter * 5));
        }
        shaper.curve = curve;
        highpass.connect(shaper);
        last.connect(highpass);
        shaper.connect(ctx.destination);
      }

      // Stereo Width
      if (buffer.numberOfChannels > 1) {
        const splitter = ctx.createChannelSplitter(2);
        const merger = ctx.createChannelMerger(2);
        const lGain = ctx.createGain();
        const rGain = ctx.createGain();
        lGain.gain.value = params.stereoWidth;
        rGain.gain.value = params.stereoWidth;
        last.connect(splitter);
        splitter.connect(lGain, 0);
        splitter.connect(rGain, 1);
        lGain.connect(merger, 0, 0);
        rGain.connect(merger, 0, 1);
        last = merger;
      }

      // Plate Reverb
      if (params.reverb > 0) {
        const convolver = ctx.createConvolver();
        convolver.buffer = generatePlateIR(ctx, 2.5);
        const rvGain = ctx.createGain();
        rvGain.gain.value = params.reverb;
        last.connect(convolver);
        convolver.connect(rvGain).connect(ctx.destination);
      }

      last.connect(ctx.destination);

      source.start();
      const rendered = await ctx.startRendering();
      return rendered;
    }

    // Controls update display
    ['gainControl2','noiseReduction2','stereoWidth2','exciterControl2','reverbControl2'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        document.getElementById('gainVal2').innerText = document.getElementById('gainControl2').value;
        document.getElementById('noiseVal2').innerText = document.getElementById('noiseReduction2').value;
        document.getElementById('widthVal2').innerText = document.getElementById('stereoWidth2').value;
        document.getElementById('exciterVal2').innerText = document.getElementById('exciterControl2').value;
        document.getElementById('reverbVal2').innerText = document.getElementById('reverbControl2').value;
      });
    });

    // Preview
    document.getElementById('previewBtn').addEventListener('click', () => {
      if (!audioBuffer) return alert("Upload audio first!");
      if (fxIsPlaying2) return;
      makeRealtimeFXChain(audioBuffer, getCurrentFXParams());
    });

    // Stop
    document.getElementById('stopBtn').addEventListener('click', () => {
      if (fxCtx2) fxCtx2.close();
      fxIsPlaying2 = false;
    });

    // Download
    document.getElementById('downloadBtn').addEventListener('click', async () => {
      if (!audioBuffer) return alert("Upload audio first!");
      const rendered = await applyMastering2(audioBuffer, getCurrentFXParams());
      renderedBuffer = rendered;

      const wav = audioBufferToWav(rendered);
      const blob = new Blob([wav], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "mastered.wav";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    // Helper: Convert buffer to WAV
    function audioBufferToWav(buffer) {
      const numOfChan = buffer.numberOfChannels;
      const length = buffer.length * numOfChan * 2 + 44;
      const bufferArr = new ArrayBuffer(length);
      const view = new DataView(bufferArr);
      const channels = [];
      let pos = 0;

      function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
      function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

      // RIFF chunk
      setUint32(0x46464952);
      setUint32(length - 8);
      setUint32(0x45564157);

      // fmt chunk
      setUint32(0x20746d66);
      setUint32(16);
      setUint16(1);
      setUint16(numOfChan);
      setUint32(buffer.sampleRate);
      setUint32(buffer.sampleRate * 2 * numOfChan);
      setUint16(numOfChan * 2);
      setUint16(16);

      // data chunk
      setUint32(0x61746164);
      setUint32(length - pos - 4);

      for (let i = 0; i < buffer.numberOfChannels; i++)
        channels.push(buffer.getChannelData(i));

      let offset = 0;
      while (pos < length) {
        for (let i = 0; i < numOfChan; i++) {
          let sample = Math.max(-1, Math.min(1, channels[i][offset]));
          view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          pos += 2;
        }
        offset++;
      }

      return bufferArr;
    }
