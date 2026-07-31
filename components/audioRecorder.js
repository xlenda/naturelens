import { Platform } from 'react-native';

// Records a short clip and turns it into exactly what Perch expects:
// mono float32 PCM at 32 kHz, base64-encoded.
//
// The conversion happens HERE, in the browser, on purpose. A browser has
// AudioContext; doing it server-side would mean shipping ffmpeg or libsndfile in
// the inference image, which is the dependency that makes a container painful to
// host anywhere. This way the server takes raw samples and needs no codec at all.
//
// Platform reality, which drives most of the code below:
//   * Android/Chrome records audio/webm;codecs=opus.
//   * iOS Safari records audio/mp4 and has NEVER supported webm. Asking for a
//     mimeType it does not know throws, so the type is negotiated, not assumed.
//   * decodeAudioData handles both, so whatever the platform gave us becomes
//     the same float32 array on the other side.

const TARGET_SAMPLE_RATE = 32000;
export const MAX_SECONDS = 10;

export function canRecord() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (typeof MediaRecorder === 'undefined') return false;
  return true;
}

// Candidates in order of preference; the first one this browser admits to
// supporting wins. Empty string = let the browser pick its own default, which
// is the correct last resort rather than failing.
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  '',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of MIME_CANDIDATES) {
    if (!type) return '';
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch (e) {
      // Older Safari throws instead of returning false.
    }
  }
  return '';
}

/**
 * Starts recording. Returns a handle with stop() -> { base64, sampleRate,
 * durationSeconds } and cancel().
 *
 * Throws with .code 'permission' when the microphone is refused, so the UI can
 * explain instead of showing a generic failure.
 */
export async function startRecording() {
  if (!canRecord()) {
    const err = new Error('unsupported');
    err.code = 'unsupported';
    throw err;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Every one of these is DISABLED deliberately. They exist to make human
        // speech clearer and they actively damage a bird recording: noise
        // suppression treats a distant call as noise, and AGC pumps the level
        // between syllables. The model wants the signal as it arrived.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
  } catch (e) {
    const err = new Error('permission');
    err.code = 'permission';
    throw err;
  }

  // Everything after getUserMedia has to release the microphone on failure. If
  // MediaRecorder construction throws - an unsupported mimeType on an old
  // browser, for instance - the stream is already open, and returning without
  // stopping its tracks leaves the recording indicator lit with no handle for
  // anyone to cancel.
  let mimeType;
  let recorder;
  try {
    mimeType = pickMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (e) {
    stream.getTracks().forEach((track) => track.stop());
    const err = new Error('unsupported');
    err.code = 'unsupported';
    throw err;
  }

  const chunks = [];
  const startedAt = Date.now();

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  recorder.start();

  // Hard stop, so a forgotten recording cannot grow without bound and blow the
  // request body limit.
  //
  // It releases the microphone too. Previously it only called recorder.stop(),
  // which meant an ORPHANED handle - one whose owner lost its reference, e.g.
  // after a double-tap - stopped recording but held the device open forever. The
  // UI has nothing left to call cancel() on in that state, so this timeout is the
  // last line of defence and has to do the full cleanup.
  //
  // stop() and cancel() both clear this timer before doing their own release, so
  // the normal paths never double-release (and track.stop() is idempotent anyway).
  const autoStop = setTimeout(() => {
    try {
      if (recorder.state === 'recording') recorder.stop();
    } catch (e) {
      // A recorder already torn down by the browser - nothing to stop, but the
      // tracks below still need releasing.
    }
    stream.getTracks().forEach((track) => track.stop());
  }, MAX_SECONDS * 1000);

  // Declared after autoStop so it can clear it - the normal exits cancel the
  // safety timer and release the device themselves.
  const releaseMic = () => {
    clearTimeout(autoStop);
    // Releasing every track is what turns the browser's recording indicator
    // off. Forgetting it leaves the mic "in use" for the rest of the session -
    // a real privacy problem, not just a cosmetic one.
    stream.getTracks().forEach((track) => track.stop());
  };

  return {
    get durationSeconds() {
      return (Date.now() - startedAt) / 1000;
    },

    cancel() {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch (e) {}
      releaseMic();
    },

    async stop() {
      const blob = await new Promise((resolve) => {
        if (recorder.state === 'inactive') {
          resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
          return;
        }
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
        recorder.stop();
      });

      releaseMic();

      if (blob.size === 0) {
        const err = new Error('empty');
        err.code = 'empty';
        throw err;
      }

      return decodeAndResample(blob);
    },
  };
}

/**
 * Decodes whatever the platform recorded and resamples to 32 kHz mono float32.
 */
export async function decodeAndResample(blob) {
  const arrayBuffer = await blob.arrayBuffer();

  // A plain AudioContext decodes at the device's own rate; OfflineAudioContext
  // lets us ask for 32 kHz directly and have the browser resample properly,
  // rather than dropping samples by hand and aliasing the result.
  const DecodeCtx = window.AudioContext || window.webkitAudioContext;
  const decodeCtx = new DecodeCtx();

  let decoded;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (e) {
    decodeCtx.close?.();
    const err = new Error('decode failed');
    err.code = 'decode';
    throw err;
  }
  decodeCtx.close?.();

  const durationSeconds = decoded.duration;
  const targetLength = Math.max(1, Math.ceil(durationSeconds * TARGET_SAMPLE_RATE));

  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  // Mono (1 channel) at the target rate. Safari historically refused unusual
  // sample rates here; 32000 is accepted by current versions, and the catch
  // below keeps a failure honest rather than silent.
  let rendered;
  try {
    const offline = new OfflineCtx(1, targetLength, TARGET_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    rendered = await offline.startRendering();
  } catch (e) {
    const err = new Error('resample failed');
    err.code = 'resample';
    throw err;
  }

  const samples = rendered.getChannelData(0);

  return {
    base64: float32ToBase64(samples),
    sampleRate: TARGET_SAMPLE_RATE,
    durationSeconds,
  };
}

// float32 samples -> base64, chunked.
//
// The chunking is not style: String.fromCharCode.apply with a 320,000-element
// array overflows the argument limit and throws "too many arguments" - which is
// exactly the length a 10-second clip produces.
function float32ToBase64(samples) {
  const bytes = new Uint8Array(new Float32Array(samples).buffer);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
