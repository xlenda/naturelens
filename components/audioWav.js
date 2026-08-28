const { fromByteArray } = require('base64-js');

function readAscii(bytes, offset, length) {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }
  return value;
}

function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes, offset) {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

/**
 * Extracts little-endian mono PCM16 from the WAV emitted by Audio Studio.
 *
 * On iOS, stopRecording() returns before the library updates the RIFF/data
 * lengths in the file header. The audio bytes are already present, though, so
 * a zero data-chunk length means "use the remaining bytes" here. This avoids a
 * timing retry and still validates the format before anything reaches Perch.
 */
function pcm16FromWavBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  if (
    bytes.length < 44
    || readAscii(bytes, 0, 4) !== 'RIFF'
    || readAscii(bytes, 8, 4) !== 'WAVE'
  ) {
    throw new Error('invalid_wav');
  }

  let format = null;
  let dataStart = -1;
  let dataLength = 0;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkId = readAscii(bytes, offset, 4);
    const declaredLength = readUint32LE(bytes, offset + 4);
    const chunkStart = offset + 8;
    const remaining = Math.max(0, bytes.length - chunkStart);

    if (chunkId === 'fmt ') {
      if (declaredLength < 16 || remaining < 16) throw new Error('invalid_wav_format');
      format = {
        audioFormat: readUint16LE(bytes, chunkStart),
        channels: readUint16LE(bytes, chunkStart + 2),
        sampleRate: readUint32LE(bytes, chunkStart + 4),
        bitDepth: readUint16LE(bytes, chunkStart + 14),
      };
    } else if (chunkId === 'data') {
      dataStart = chunkStart;
      // Audio Studio may still have zero in the header when iOS hands the file
      // back. A length beyond EOF is treated the same way, never read past EOF.
      dataLength = declaredLength > 0 && declaredLength <= remaining
        ? declaredLength
        : remaining;
      break;
    }

    if (declaredLength > remaining) break;
    offset = chunkStart + declaredLength + (declaredLength % 2);
  }

  if (!format || dataStart < 0) throw new Error('invalid_wav_chunks');
  if (format.audioFormat !== 1) throw new Error('unsupported_wav_encoding');
  if (format.channels !== 1 || format.bitDepth !== 16 || !format.sampleRate) {
    throw new Error('unsupported_wav_format');
  }

  // One PCM16 frame is two bytes. Ignore a partially flushed trailing byte.
  dataLength -= dataLength % 2;
  if (dataLength < 2) throw new Error('empty_wav');

  const pcm = bytes.subarray(dataStart, dataStart + dataLength);
  return {
    base64: fromByteArray(pcm),
    sampleRate: format.sampleRate,
    durationMs: (dataLength / 2 / format.sampleRate) * 1000,
    byteLength: dataLength,
  };
}

module.exports = { pcm16FromWavBytes };
