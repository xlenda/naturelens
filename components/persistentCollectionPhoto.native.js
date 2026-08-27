import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

const PHOTO_DIRECTORY = `${FileSystem.documentDirectory}naturelens-collection/`;

async function ensureDirectory() {
  const info = await FileSystem.getInfoAsync(PHOTO_DIRECTORY);
  if (!info.exists) await FileSystem.makeDirectoryAsync(PHOTO_DIRECTORY, { intermediates: true });
}

export async function persistCollectionPhoto(uri) {
  if (typeof uri !== 'string' || !uri) throw new Error('invalid-photo-uri');
  if (uri.startsWith(PHOTO_DIRECTORY)) return uri;
  if (!FileSystem.documentDirectory) throw new Error('persistent-storage-unavailable');
  await ensureDirectory();
  const destination = `${PHOTO_DIRECTORY}${Crypto.randomUUID()}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

export async function deletePersistentCollectionPhoto(uri) {
  if (typeof uri !== 'string' || !uri.startsWith(PHOTO_DIRECTORY)) return true;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    return true;
  } catch {
    return false;
  }
}

export { PHOTO_DIRECTORY };
