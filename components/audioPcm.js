const { fromByteArray, toByteArray } = require('base64-js');

const TARGET_SAMPLE_RATE = 32000;

function pcm16Base64ToFloat32(base64) {
  const bytes = toByteArray(base64);
  const sampleCount = Math.floor(bytes.length / 2);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const low = bytes[i * 2];
    const high = bytes[i * 2 + 1];
    const unsigned = low | (high << 8);
    const signed = unsigned > 32767 ? unsigned - 65536 : unsigned;
    samples[i] = signed / 32768;
  }
  return samples;
}

function resampleLinear(samples, sourceRate, targetRate = TARGET_SAMPLE_RATE) {
  if (!(samples instanceof Float32Array) || samples.length === 0) return new Float32Array(0);
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0) {
    throw new Error('invalid sample rate');
  }
  if (sourceRate === targetRate) return Float32Array.from(samples);

  const targetLength = Math.max(1, Math.floor((samples.length * targetRate) / sourceRate));
  const output = new Float32Array(targetLength);
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < targetLength; i += 1) {
    const sourcePosition = i * ratio;
    const left = Math.floor(sourcePosition);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = sourcePosition - left;
    output[i] = samples[left] + (samples[right] - samples[left]) * fraction;
  }
  return output;
}

// Downsampling needs a low-pass stage before samples are discarded. Plain
// linear interpolation folds everything above the new Nyquist frequency back
// into the bird-call band (aliasing), which can look like a real species cue to
// Perch. A compact windowed-sinc kernel keeps native Android evidence faithful
// without adding another native dependency.
function resampleBandLimited(samples, sourceRate, targetRate = TARGET_SAMPLE_RATE) {
  if (!(samples instanceof Float32Array) || samples.length === 0) return new Float32Array(0);
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0) {
    throw new Error('invalid sample rate');
  }
  if (sourceRate === targetRate) return Float32Array.from(samples);
  if (targetRate > sourceRate) return resampleLinear(samples, sourceRate, targetRate);

  const targetLength = Math.max(1, Math.floor((samples.length * targetRate) / sourceRate));
  const output = new Float32Array(targetLength);
  const ratio = sourceRate / targetRate;
  const halfWidth = 16;
  // A small transition band avoids pretending the finite kernel is a brick-wall filter.
  const cutoff = 0.5 * (targetRate / sourceRate) * 0.94;

  for (let i = 0; i < targetLength; i += 1) {
    const position = i * ratio;
    const centre = Math.floor(position);
    let weighted = 0;
    let weightTotal = 0;
    for (let sourceIndex = centre - halfWidth + 1; sourceIndex <= centre + halfWidth; sourceIndex += 1) {
      if (sourceIndex < 0 || sourceIndex >= samples.length) continue;
      const distance = sourceIndex - position;
      if (Math.abs(distance) >= halfWidth) continue;
      const angle = Math.PI * 2 * cutoff * distance;
      const sinc = Math.abs(angle) < 1e-12 ? 1 : Math.sin(angle) / angle;
      const window = 0.5 + 0.5 * Math.cos(Math.PI * distance / halfWidth);
      const weight = 2 * cutoff * sinc * window;
      weighted += samples[sourceIndex] * weight;
      weightTotal += weight;
    }
    const value = weightTotal ? weighted / weightTotal : samples[Math.min(centre, samples.length - 1)];
    output[i] = Math.max(-1, Math.min(1, value));
  }
  return output;
}

function float32ToBase64(samples) {
  return fromByteArray(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
}

function nativePcm16Clip(base64, sourceRate, durationMs, buildWaveformPeaks) {
  const decoded = pcm16Base64ToFloat32(base64);
  if (decoded.length === 0) {
    const error = new Error('empty');
    error.code = 'empty';
    throw error;
  }
  const samples = resampleBandLimited(decoded, sourceRate, TARGET_SAMPLE_RATE);
  return {
    base64: float32ToBase64(samples),
    sampleRate: TARGET_SAMPLE_RATE,
    durationSeconds: Number.isFinite(durationMs) && durationMs > 0
      ? durationMs / 1000
      : decoded.length / sourceRate,
    waveform: buildWaveformPeaks(samples),
  };
}

module.exports = {
  TARGET_SAMPLE_RATE,
  pcm16Base64ToFloat32,
  resampleBandLimited,
  resampleLinear,
  float32ToBase64,
  nativePcm16Clip,
};
