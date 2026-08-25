import { Platform } from 'react-native';
import { File } from 'expo-file-system';

const { buildWaveformPeaks } = require('./audioWaveform');
const { nativePcm16Clip } = require('./audioPcm');

const NATIVE_SAMPLE_RATE = 48000;
export const MAX_SECONDS = 10;

let nativeAudioCache;

function nativeAudio() {
  if (nativeAudioCache !== undefined) return nativeAudioCache;
  try {
    // Expo Go nao carrega modulos nativos externos; o APK/AAB do projeto carrega.
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

function deleteTemporaryFile(uri) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (e) {
    // O arquivo fica no cache privado e o Android ainda pode remove-lo depois.
  }
}

export function canRecord() {
  const audio = nativeAudio();
  return Platform.OS === 'android'
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

async function stopAndDecode(AudioStudioModule, extractAudioData) {
  let recording;
  try {
    recording = await AudioStudioModule.stopRecording();
  } catch (cause) {
    throw codedError('empty', cause);
  }

  const uri = recording?.fileUri;
  if (!uri) throw codedError('empty');
  try {
    const extracted = await extractAudioData({
      fileUri: uri,
      includeBase64Data: true,
      includeNormalizedData: false,
      includeWavHeader: false,
      decodingOptions: {
        targetSampleRate: NATIVE_SAMPLE_RATE,
        targetChannels: 1,
        targetBitDepth: 16,
        normalizeAudio: false,
      },
    });
    if (typeof extracted?.base64Data !== 'string' || !extracted.base64Data) {
      throw codedError('decode');
    }
    return nativePcm16Clip(
      extracted.base64Data,
      Number(extracted.sampleRate) || NATIVE_SAMPLE_RATE,
      Number(extracted.durationMs) || Number(recording.durationMs),
      buildWaveformPeaks
    );
  } catch (cause) {
    if (cause?.code) throw cause;
    throw codedError('decode', cause);
  } finally {
    // O som bruto serve apenas a identificacao atual e nunca vira dado salvo.
    deleteTemporaryFile(uri);
  }
}

export async function startRecording() {
  if (!canRecord()) throw codedError('unsupported');
  const { AudioStudioModule, extractAudioData } = nativeAudio();
  await ensurePermission(AudioStudioModule);

  try {
    await AudioStudioModule.startRecording({
      sampleRate: NATIVE_SAMPLE_RATE,
      channels: 1,
      encoding: 'pcm_16bit',
      interval: 250,
      keepAwake: false,
      showNotification: false,
      enableProcessing: false,
      output: {
        primary: { enabled: true },
        compressed: { enabled: false },
      },
    });
  } catch (cause) {
    throw codedError('unsupported', cause);
  }

  const startedAt = Date.now();
  let stopPromise = null;
  let cancelled = false;

  const finishOnce = () => {
    if (!stopPromise) stopPromise = stopAndDecode(AudioStudioModule, extractAudioData);
    return stopPromise;
  };

  // Mesmo se a tela perder a referencia, o microfone fecha no limite prometido.
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
