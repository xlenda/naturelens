// Proves the browser will actually hand this origin a microphone, and that the
// full record -> resample -> base64 chain produces what Perch expects.
//
// This is the test whose absence let a Permissions-Policy header ship the whole
// sound feature dead: everything downstream was verified with pre-recorded audio.
const { spawn } = require('child_process');
const fs = require('fs'); const os = require('os');
const CDP = require('chrome-remote-interface');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A fixed port plus a blind 3.5s wait made this gate flake: it failed once
// during a deploy and passed immediately afterwards, alone and in a re-run. Both
// halves were wrong. The port collided with any other Chrome this project had
// left listening, and the sleep assumed Chrome opens its debugging port within a
// fixed time, which it does not on a loaded machine.
//
// A flaky gate is worse than no gate. This one exists because a Permissions-
// Policy header shipped the whole sound feature dead while every other check was
// green - if it cries wolf, the next real failure gets waved through.
const PORT = 9700 + Math.floor(Math.random() * 200);

// Poll for the port rather than guessing how long Chrome needs.
async function connectWhenReady(port, budgetMs = 20000) {
  const deadline = Date.now() + budgetMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await CDP({ port });
    } catch (e) {
      lastError = e;
      await sleep(250);
    }
  }
  throw new Error(`Chrome never opened port ${port}: ${lastError?.message || 'unknown'}`);
}

(async () => {
  const proc = spawn(CHROME, ['--remote-debugging-port=' + PORT, '--headless=new', '--disable-gpu',
    '--no-first-run', '--no-sandbox',
    // Chrome synthesises a beeping microphone, so getUserMedia resolves with a
    // real MediaStream and MediaRecorder produces real bytes.
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--user-data-dir=' + os.tmpdir() + '/mic' + Date.now(), 'about:blank'], { stdio: 'ignore' });

  // Kill Chrome however this process ends, including a throw before the normal
  // teardown - a leaked headless Chrome is what makes the NEXT run collide.
  const killChrome = () => {
    try {
      proc.kill();
    } catch (e) {
      /* already gone */
    }
  };
  process.on('exit', killChrome);

  const client = await connectWhenReady(PORT);
  const { Page, Runtime, Browser } = client;
  await Page.enable(); await Runtime.enable();
  await Browser.grantPermissions({ origin: 'https://naturelensapp.cloud', permissions: ['audioCapture'] }).catch(() => {});
  const ev = async (x) => (await Runtime.evaluate({ expression: x, returnByValue: true, awaitPromise: true })).result.value;
  await Page.navigate({ url: 'https://naturelensapp.cloud/' });
  await Page.loadEventFired();
  await sleep(4000);

  const report = await ev(`(async function(){
    var out = {};
    out.policy = 'n/a';
    // 1. Does the origin get a microphone at all?
    try {
      var stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}});
      out.gotStream = true;
      out.tracks = stream.getTracks().length;
      // 2. Record a real second of it.
      var types = ['audio/webm;codecs=opus','audio/webm','audio/mp4',''];
      var mime = types.filter(function(t){ return !t || MediaRecorder.isTypeSupported(t); })[0];
      out.mimeType = mime || '(default)';
      var chunks = [];
      var rec = new MediaRecorder(stream, mime ? {mimeType:mime} : undefined);
      rec.ondataavailable = function(e){ if(e.data && e.data.size) chunks.push(e.data); };
      rec.start();
      await new Promise(function(r){ setTimeout(r, 2200); });
      await new Promise(function(r){ rec.onstop = r; rec.stop(); });
      stream.getTracks().forEach(function(t){ t.stop(); });
      var blob = new Blob(chunks, {type: mime || 'audio/webm'});
      out.blobBytes = blob.size;
      // 3. Decode and resample to Perch's contract, exactly as the app does.
      var buf = await blob.arrayBuffer();
      var dctx = new (window.AudioContext||window.webkitAudioContext)();
      var decoded = await dctx.decodeAudioData(buf.slice(0));
      dctx.close && dctx.close();
      out.decodedSeconds = Math.round(decoded.duration*100)/100;
      out.decodedRate = decoded.sampleRate;
      var len = Math.max(1, Math.ceil(decoded.duration*32000));
      var off = new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1, len, 32000);
      var src = off.createBufferSource(); src.buffer = decoded;
      src.connect(off.destination); src.start();
      var rendered = await off.startRendering();
      var samples = rendered.getChannelData(0);
      out.samples = samples.length;
      out.targetRate = rendered.sampleRate;
      out.silent = !samples.some(function(v){ return Math.abs(v) > 0.001; });
      // 4. base64, chunked exactly like float32ToBase64.
      var bytes = new Uint8Array(new Float32Array(samples).buffer);
      var bin = '';
      for (var i=0;i<bytes.length;i+=8192) bin += String.fromCharCode.apply(null, bytes.subarray(i,i+8192));
      out.base64KB = Math.round(btoa(bin).length/1024);
    } catch (e) {
      out.gotStream = false;
      out.error = e.name + ': ' + e.message;
    }
    return JSON.stringify(out);
  })()`);

  const r = JSON.parse(report);
  console.log('microfone concedido    :', r.gotStream ? 'SIM' : 'NAO -> ' + r.error);
  if (r.gotStream) {
    console.log('formato negociado      :', r.mimeType);
    console.log('bytes gravados         :', r.blobBytes);
    console.log('decodificado           :', r.decodedSeconds + 's a ' + r.decodedRate + 'Hz');
    console.log('reamostrado            :', r.samples + ' amostras a ' + r.targetRate + 'Hz');
    console.log('audio tem sinal        :', r.silent ? 'NAO (silencio)' : 'SIM');
    console.log('tamanho em base64      :', r.base64KB + ' KB (limite Vercel 4608 KB)');
  }
  await client.close(); proc.kill();
  process.exit(r.gotStream && !r.silent ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
