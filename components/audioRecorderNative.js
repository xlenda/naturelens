import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

const { buildWaveformPeaks } = require('./audioWaveform');
const { nativePcm16Clip } = require('./audioPcm');
const { pcm16FromWavBytes } = require('./audioWav');

const NATIVE_SAMPLE_RATE = 48000;
const WAV_READ_INTERVAL_MS = 50;
const WAV_STABLE_READS = 4;
const WAV_MAX_READ_ATTEMPTS = 12;
// iOS captures in buffers of about 100 ms. One buffer of tolerance covers the
// stop boundary without accepting the old 500 ms truncation window.
const WAV_CAPTURE_BUFFER_TOLERANCE_MS = 150;
const AUDIO_CACHE_DIRECTORY = 'naturelens-audio-v1';
const LEGACY_AUDIO_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.wav$/i;
export const MAX_SECONDS = 10;

let nativeAudioCache;
// Audio Studio owns one native recorder process-wide. A blur cancellation is
// intentionally fire-and-forget at the screen boundary, but a person can come
// straight back and tap again before stopRecording() has flushed its WAV. The
// next start waits for that shutdown so it cannot race the old native session
// or delete the cache file while the old decoder is still reading it.
let nativeShutdownPromise = null;

function nativeAudio() {
  if (nativeAudioCache !== undefined) return nativeAudioCache;
  try {
    // Expo Go does not include this external native module. Development,
    // preview and store builds do.
    nativeAudioCache = require('@siteed/audio-studio');
  } catch (e) {
    nativeAudioCache = null;
  }
  return nativeAudioCache;
}

function codedError(code, cause) {
  const error = new Error(code);
  error.code = code;
  error.cause = cause;
  return error;
}

function reportDeferredCleanup() {
  // Never log a path or filename. The app-owned cache sweep retries on the
  // next launch and before the next recording.
  // eslint-disable-next-line no-console
  console.warn('[audio] temporary recording cleanup deferred');
}

function deleteTemporaryFile(uri) {
  if (!uri) return true;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
    return !file.exists;
  } catch (e) {
    reportDeferredCleanup();
    return false;
  }
}

function deleteLegacyPersistentWavs() {
  const documentDirectory = Paths.document;
  if (!documentDirectory.exists) return;
  for (const entry of documentDirectory.list()) {
    if (LEGACY_AUDIO_FILE.test(entry.name || '') && typeof entry.delete === 'function') {
      try {
        entry.delete();
      } catch (e) {
        reportDeferredCleanup();
      }
    }
  }
}

function resetOwnedAudioCache() {
  const directory = new Directory(Paths.cache, AUDIO_CACHE_DIRECTORY);
  if (directory.exists) directory.delete();
  directory.create({ idempotent: true, intermediates: true });
  return directory;
}

// Safe at every app launch. Only the NatureLens-owned cache directory and the
// UUID WAV names created by Audio Studio's old default are touched.
export function cleanupAbandonedNativeAudio() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return true;
  let cleaned = true;
  try {
    resetOwnedAudioCache();
  } catch (e) {
    cleaned = false;
    reportDeferredCleanup();
  }
  try {
    deleteLegacyPersistentWavs();
  } catch (e) {
    cleaned = false;
    reportDeferredCleanup();
  }
  return cleaned;
}

function prepareAudioOutputDirectory() {
  let directory;
  try {
    directory = resetOwnedAudioCache();
  } catch (cause) {
    throw codedError('storage', cause);
  }

  // A legacy migration failure must not put new recordings back in Documents.
  // The new recording is already isolated in cache; report the old cleanup and
  // retry it at the next launch without disabling the microphone meanwhile.
  try {
    deleteLegacyPersistentWavs();
  } catch (e) {
    reportDeferredCleanup();
  }
  return directory.uri;
}

async function waitForNativeShutdown() {
  const pending = nativeShutdownPromise;
  if (pending) await pending;
}

export function canRecord() {
  const audio = nativeAudio();
  return (Platform.OS === 'android' || Platform.OS === 'ios')
    && typeof audio?.AudioStudioModule?.startRecording === 'function'
    && typeof audio?.AudioStudioModule?.stopRecording === 'function';
}

async function ensurePermission(AudioStudioModule) {
  let permission;
  try {
    permission = await AudioStudioModule.getPermissionsAsync();
    if (!permission?.granted) permission = await AudioStudioModule.requestPermissionsAsync();
  } catch (cause) {
    throw codedError('permission', cause);
  }
  if (!permission?.granted) throw codedError('permission');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readStableWav(uri, recording) {
  const file = new File(uri);
  let previousLength = -1;
  let stableReads = 0;
  const sampleRate = Number(recording?.sampleRate) || NATIVE_SAMPLE_RATE;
  const channels = Number(recording?.channels) || 1;
  const bytesPerSample = (Number(recording?.bitDepth) || 16) / 8;
  const expectedAudioMs = Math.max(
    0,
    (Number(recording?.durationMs) || 0) - WAV_CAPTURE_BUFFER_TOLERANCE_MS
  );
  const expectedMinimum = 44 + Math.floor(
    (expectedAudioMs / 1000) * sampleRate * channels * bytesPerSample
  );

  // Audio Studio writes captured buffers on a utility queue. After stop, wait
  // for a real quiet window, not just one equal pair: a loaded iPhone can pause
  // that queue briefly and make a partial file look stable. We also require all
  // but at most one native capture buffer to be present. If the file never
  // settles, fail honestly instead of identifying a truncated recording.
  for (let attempt = 0; attempt < WAV_MAX_READ_ATTEMPTS; attempt += 1) {
    try {
      const bytes = await file.bytes();
      stableReads = bytes.length === previousLength ? stableReads + 1 : 1;
      previousLength = bytes.length;
      if (
        bytes.length > 44
        && bytes.length >= expectedMinimum
        && stableReads >= WAV_STABLE_READS
      ) {
        return bytes;
      }
    } catch (cause) {
      stableReads = 0;
      if (attempt === WAV_MAX_READ_ATTEMPTS - 1) throw cause;
    }
    if (attempt < WAV_MAX_READ_ATTEMPTS - 1) await wait(WAV_READ_INTERVAL_MS);
  }
  throw codedError('incomplete_wav');
}

async function stopAndDecode(AudioStudioModule, shouldDecode) {
  let recording;
  try {
    recording = await AudioStudioModule.stopRecording();
  } catch (cause) {
    throw codedError('empty', cause);
  }

  const uri = recording?.fileUri;
  if (!uri) throw codedError('empty');
  try {
    // Blur/background cancellation only needs to close the native recorder and
    // erase its file. Avoid spending CPU and allocating a multi-megabyte base64
    // clip that the screen has already promised to discard.
    if (!shouldDecode()) throw codedError('empty');
    // Reading the WAV ourselves is intentional. Audio Studio 3.2.1 updates the
    // iOS header asynchronously after stopRecording(), while its extractor also
    // requires a range. audioWav accepts that transient zero-length header and
    // consumes only validated PCM16 mono samples already present in the file.
    const bytes = await readStableWav(uri, recording);
    if (!shouldDecode()) throw codedError('empty');
    const pcm = pcm16FromWavBytes(bytes);
    return nativePcm16Clip(
      pcm.base64,
      pcm.sampleRate,
      pcm.durationMs || Number(recording.durationMs),
      buildWaveformPeaks
    );
  } catch (cause) {
    if (cause?.code) throw cause;
    throw codedError('decode', cause);
  } finally {
    // Raw sound serves only this identification. It is deleted immediately
    // after local conversion, before any network upload can begin.
    deleteTemporaryFile(uri);
  }
}

export async function startRecording() {
  if (!canRecord()) throw codedError('unsupported');
  const { AudioStudioModule } = nativeAudio();
  await ensurePermission(AudioStudioModule);
  await waitForNativeShutdown();
  const outputDirectory = prepareAudioOutputDirectory();

  try {
    await AudioStudioModule.startRecording({
      sampleRate: NATIVE_SAMPLE_RATE,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 250,
      keepAwake: false,
      showNotification: false,
      enableProcessing: false,
      outputDirectory,
      output: {
        primary: { enabled: true, format: 'wav' },
        compressed: { enabled: false },
      },
      ...(Platform.OS === 'ios' ? {
        ios: {
          audioSession: {
            category: 'Record',
            mode: 'Measurement',
            categoryOptions: [],
          },
        },
      } : {}),
    });
  } catch (cause) {
    throw codedError('unsupported', cause);
  }

  const startedAt = Date.now();
  let stopPromise = null;
  let cancelled = false;

  const finishOnce = () => {
    if (!stopPromise) {
      stopPromise = stopAndDecode(AudioStudioModule, () => !cancelled);
      const shutdown = stopPromise.then(
        () => undefined,
        () => undefined
      );
      nativeShutdownPromise = shutdown;
      shutdown.then(() => {
        if (nativeShutdownPromise === shutdown) nativeShutdownPromise = null;
      });
    }
    return stopPromise;
  };

  // Even if the screen loses the handle, the microphone closes at the promised
  // limit. The screen has the same deadline so its visible state also settles.
  const autoStop = setTimeout(() => {
    finishOnce().catch(() => {});
  }, MAX_SECONDS * 1000);

  return {
    get durationSeconds() {
      return Math.min(MAX_SECONDS, (Date.now() - startedAt) / 1000);
    },

    cancel() {
      cancelled = true;
      clearTimeout(autoStop);
      finishOnce().catch(() => {});
    },

    async stop() {
      clearTimeout(autoStop);
      const clip = await finishOnce();
      if (cancelled) throw codedError('empty');
      return clip;
    },
  };
}
