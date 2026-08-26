import AsyncStorage from '@react-native-async-storage/async-storage';

export const PET_PROFILE_KEY = '@naturelens_pet_profile_v1';

export const EMPTY_PET_PROFILE = Object.freeze({
  dog: false,
  cat: false,
});

export function normalisePetProfile(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    dog: source.dog === true,
    cat: source.cat === true,
  };
}

export async function getPetProfile() {
  try {
    const raw = await AsyncStorage.getItem(PET_PROFILE_KEY);
    return normalisePetProfile(raw ? JSON.parse(raw) : null);
  } catch (e) {
    return { ...EMPTY_PET_PROFILE };
  }
}

export async function setPetProfile(value) {
  const profile = normalisePetProfile(value);
  await AsyncStorage.setItem(PET_PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export async function clearPetProfile() {
  try {
    await AsyncStorage.removeItem(PET_PROFILE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}
