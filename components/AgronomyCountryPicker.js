import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ISO_ALPHA2_CODES, normalizeCountryCode } from './agronomyProfileV2';
import { colors, control, radius, shadow, space, type } from './theme';

function searchText(value) {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
    : '';
}

export function agronomyCountryName(code, language) {
  const countryCode = normalizeCountryCode(code);
  if (!countryCode) return '';
  try {
    const displayNames = new Intl.DisplayNames([language || 'en'], { type: 'region' });
    const label = displayNames.of(countryCode);
    return typeof label === 'string' && label.trim() && label !== countryCode
      ? label.trim()
      : countryCode;
  } catch (error) {
    return countryCode;
  }
}

export function buildAgronomyCountryOptions(language) {
  const options = ISO_ALPHA2_CODES.map((code) => ({
    code,
    label: agronomyCountryName(code, language),
  }));
  try {
    const collator = new Intl.Collator(language || 'en', { sensitivity: 'base' });
    return options.sort((left, right) => collator.compare(left.label, right.label));
  } catch (error) {
    return options.sort((left, right) => left.label.localeCompare(right.label));
  }
}

export default function AgronomyCountryPicker({ visible, value, onSelect, onClose }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const options = useMemo(() => buildAgronomyCountryOptions(i18n.language), [i18n.language]);
  const filtered = useMemo(() => {
    const needle = searchText(query);
    if (!needle) return options;
    return options.filter((option) => (
      searchText(option.label).includes(needle) || option.code.toLowerCase().includes(needle)
    ));
  }, [options, query]);

  function close() {
    setQuery('');
    if (typeof onClose === 'function') onClose();
  }

  function select(code) {
    setQuery('');
    if (typeof onSelect === 'function') onSelect(code);
  }

  return (
    <Modal
      visible={visible === true}
      animationType="slide"
      transparent={false}
      onRequestClose={close}
      accessibilityViewIsModal={true}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{t('agronomyProfile.manualLocationTitle')}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t('agronomyProfile.countryPickerTitle')}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t('agronomyProfile.closeCountryPicker')}
          >
            <Ionicons name="close" size={23} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={(text) => setQuery(text.slice(0, 80))}
            placeholder={t('agronomyProfile.countrySearchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="search"
            maxLength={80}
            accessibilityLabel={t('agronomyProfile.countrySearchPlaceholder')}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          maxToRenderPerBatch={24}
          windowSize={7}
          contentContainerStyle={filtered.length === 0 ? styles.emptyList : styles.list}
          renderItem={({ item }) => {
            const selected = item.code === value;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.countryRow,
                  selected ? styles.countryRowSelected : null,
                  pressed ? styles.pressed : null,
                ]}
                onPress={() => select(item.code)}
                accessibilityRole="radio"
                accessibilityLabel={`${item.label}, ${item.code}`}
                accessibilityState={{ checked: selected }}
              >
                <View style={styles.countryCopy}>
                  <Text style={[styles.countryName, selected ? styles.countryNameSelected : null]}>
                    {item.label}
                  </Text>
                  <Text style={styles.countryCode}>{item.code}</Text>
                </View>
                {selected ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.accentLight} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>{t('agronomyProfile.countryNotFound')}</Text>
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerCopy: { flex: 1 },
  eyebrow: { ...type.caption, color: colors.accentLight, fontWeight: '900' },
  title: { ...type.sectionTitle, marginTop: space.xxs },
  closeButton: {
    width: control.minTouch,
    height: control.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  searchBox: {
    minHeight: control.primaryHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    ...shadow,
  },
  searchInput: { flex: 1, minHeight: control.minTouch, color: colors.text, fontSize: 15 },
  list: { paddingHorizontal: space.md, paddingBottom: space.xxl },
  emptyList: { flexGrow: 1, paddingHorizontal: space.md, paddingBottom: space.xxl },
  countryRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  countryRowSelected: { borderColor: colors.accent, backgroundColor: colors.accent + '18' },
  countryCopy: { flex: 1 },
  countryName: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  countryNameSelected: { color: colors.accentLight, fontWeight: '900' },
  countryCode: { ...type.caption, marginTop: 2 },
  pressed: { opacity: 0.72 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  emptyText: { ...type.body, textAlign: 'center' },
});
