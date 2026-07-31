// Bird/frog/insect/mammal identification by SOUND, via Google Perch 2.0.
//
// WHY PERCH AND NOT BIRDNET
// BirdNET is the better-known model, but its weights are CC BY-NC-SA 4.0 -
// non-commercial, and ShareAlike, so even a fine-tune inherits the restriction.
// This app sells subscriptions, so BirdNET is off the table without a licence
// from Cornell. Perch 2.0 (Google Research) is **Apache 2.0** - commercial use
// permitted, no permission needed - and covers MORE: ~14,795 classes including
// ~10,000 birds plus frogs, crickets, grasshoppers and mammals. For an app
// called NatureLens that is not a workaround, it is an upgrade.
// Verified 2026-07-30: github.com/google-research/perch (Apache-2.0) and
// huggingface.co/justinchuby/Perch-onnx (weights, Apache 2.0).
//
// WHY THIS IS AN HTTP CALL AND NOT A LOCAL MODEL
// The ONNX weights are 390 MB. That does not fit in a Vercel serverless bundle
// (250 MB cap) and is far too large to download to a phone. So the model runs
// on a separate inference host and this file just talks to it - the same shape
// as the Kindwise/Fishial/Nyckel integrations already here.
//
// The host is configured, not hardcoded: PERCH_ENDPOINT (+ optional
// PERCH_AUTH_TOKEN). With no endpoint set the category is simply unavailable,
// exactly like the bird-photo category before its Nyckel function existed. See
// docs/perch-host/ for a ready-to-deploy inference server.

const STEP_TIMEOUT_MS = 45000; // audio inference is slower than an image call

// Perch's input contract, confirmed from the model card: mono 32 kHz, 5-second
// window = exactly 160,000 float32 samples. The CLIENT does the resampling,
// because a browser has an AudioContext and a serverless function does not.
const EXPECTED_SAMPLE_RATE = 32000;
const WINDOW_SECONDS = 5;

// Longest clip this endpoint will forward, in seconds.
//
// The app records at most 10; the ceiling is 12 so a slightly long clip from a
// slow device is not rejected for being 200ms over.
//
// Why it matters: the request body limit upstream is 4.5 MB, which is about 34
// seconds of 32 kHz float32 audio - seven 5-second windows, i.e. SEVEN model
// inferences for one HTTP request. A hand-crafted payload could therefore
// multiply the per-request cost sevenfold against a 2-core VPS that also runs
// the owner's production dashboard, API and bot. The inference host caps this
// too, but doing it here means the bytes never leave Vercel.
const MAX_AUDIO_SECONDS = 12;

// base64 is 4 characters per 3 bytes; float32 is 4 bytes per sample.
const MAX_AUDIO_BASE64_CHARS = Math.ceil((MAX_AUDIO_SECONDS * EXPECTED_SAMPLE_RATE * 4) / 3) * 4;

async function perchIdentify({ res, audio, sampleRate, topK = 3 }) {
  const endpoint = process.env.PERCH_ENDPOINT?.trim();
  if (!endpoint) {
    res.status(503).json({ error: 'Sound identification is not configured on the server.' });
    return null;
  }

  if (typeof audio !== 'string' || !audio) {
    res.status(400).json({ error: 'Missing "audio" (base64) in request body' });
    return null;
  }

  if (audio.length > MAX_AUDIO_BASE64_CHARS) {
    // 413 rather than 400: the payload is well-formed, just too big. The app can
    // never hit this (it hard-stops at 10s), so the message is for whoever is
    // poking at the endpoint directly.
    res.status(413).json({
      error: `Recording is too long - the limit is ${MAX_AUDIO_SECONDS} seconds.`,
    });
    return null;
  }

  // A wrong sample rate is not something the client can produce - audioRecorder
  // always resamples to 32 kHz through an OfflineAudioContext - so reject it here
  // instead of spending a round trip to the host to be told the same thing. The
  // host still validates independently; this only makes the failure legible.
  if (sampleRate && Number(sampleRate) !== EXPECTED_SAMPLE_RATE) {
    res.status(400).json({
      error: `Audio must be ${EXPECTED_SAMPLE_RATE} Hz, got ${sampleRate}.`,
    });
    return null;
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = process.env.PERCH_AUTH_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        // Raw PCM float32 samples, base64-encoded. Sending decoded samples
        // rather than an encoded file means the host needs no audio codec -
        // no ffmpeg, no libsndfile, which is what makes it deployable anywhere.
        audio,
        sample_rate: sampleRate || EXPECTED_SAMPLE_RATE,
        top_k: topK,
      }),
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('perch: host returned', response.status, detail.slice(0, 200));
      res.status(502).json({ error: 'Could not identify this recording. Please try again.' });
      return null;
    }

    return await response.json();
  } catch (e) {
    // A timeout here is the common failure: the inference host may be a free
    // tier that sleeps and needs ~30s to wake. Say "try again" rather than
    // blaming the recording.
    console.error('perch: request failed', e.message);
    res.status(502).json({ error: 'Could not reach the sound identification service.' });
    return null;
  }
}

module.exports = { perchIdentify, EXPECTED_SAMPLE_RATE, WINDOW_SECONDS };
