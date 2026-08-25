const WAVEFORM_PEAK_COUNT = 40;

// Condenses decoded PCM into real amplitude peaks. The result is intentionally
// tiny enough for navigation state: no audio bytes, codec data or playback
// material leave the recorder.
function buildWaveformPeaks(samples, requestedCount = WAVEFORM_PEAK_COUNT) {
  if (!samples || typeof samples.length !== 'number' || samples.length === 0) return [];

  const numericCount = Number(requestedCount);
  const peakCount = Math.max(
    32,
    Math.min(48, Number.isFinite(numericCount) ? Math.round(numericCount) : WAVEFORM_PEAK_COUNT)
  );
  const rawPeaks = [];

  for (let i = 0; i < peakCount; i += 1) {
    const start = Math.floor((i * samples.length) / peakCount);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / peakCount));
    let peak = 0;

    for (let j = start; j < end && j < samples.length; j += 1) {
      const sample = Number(samples[j]);
      if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
    }
    rawPeaks.push(peak);
  }

  const loudest = Math.max(...rawPeaks);
  if (!(loudest > 0)) return rawPeaks.map(() => 0);

  return rawPeaks.map((peak) => Math.round((peak / loudest) * 1000) / 1000);
}

module.exports = { WAVEFORM_PEAK_COUNT, buildWaveformPeaks };
