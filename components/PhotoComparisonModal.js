import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { canonicalEvidenceKey, evidenceLabelKey } from './evidencePhotos';
import { colors, control, radius, space, type } from './theme';

const MODES = Object.freeze(['user', 'split', 'reference']);

function ModeButton({ active, icon, label, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.modeButton, active && styles.modeButtonActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={17} color={active ? colors.text : colors.textMuted} />
      <Text style={[styles.modeText, active && styles.modeTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PhotoPanel({ uri, label, compact = false, onError }) {
  return (
    <View style={[styles.photoPanel, compact && styles.photoPanelCompact]}>
      <Image source={{ uri }} style={styles.photo} resizeMode="cover" onError={onError} />
      <View style={styles.photoLabel} pointerEvents="none">
        <Text style={styles.photoLabelText} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

export default function PhotoComparisonModal({
  visible,
  onClose,
  userUri,
  photos,
  initialIndex = 0,
  onReferenceError,
}) {
  const { t } = useTranslation();
  const usable = useMemo(() => (photos || []).filter((photo) => photo?.url), [photos]);
  const [mode, setMode] = useState('split');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setMode('split');
    setIndex(Math.max(0, Math.min(initialIndex, usable.length - 1)));
  }, [visible, initialIndex, usable.length]);

  const reference = usable[index] || null;
  if (!userUri || !reference) return null;

  const referenceLabel = t(evidenceLabelKey(reference));
  const previous = () => setIndex((current) => (current - 1 + usable.length) % usable.length);
  const next = () => setIndex((current) => (current + 1) % usable.length);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <View
          style={styles.screen}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title} accessibilityRole="header">{t('identify.comparePhotos')}</Text>
              <Text style={styles.subtitle}>{t('identify.comparePhotosHint')}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.stage}>
            {mode === 'split' ? (
              <View style={styles.splitRow}>
                <PhotoPanel uri={userUri} label={t('common.yourPhoto')} compact />
                <PhotoPanel
                  uri={reference.full || reference.url}
                  label={referenceLabel}
                  compact
                  onError={() => onReferenceError?.(reference.url)}
                />
              </View>
            ) : mode === 'user' ? (
              <PhotoPanel uri={userUri} label={t('common.yourPhoto')} />
            ) : (
              <PhotoPanel
                uri={reference.full || reference.url}
                label={referenceLabel}
                onError={() => onReferenceError?.(reference.url)}
              />
            )}
          </View>

          <View style={styles.modeBar} accessibilityRole="tablist">
            <ModeButton
              active={mode === MODES[0]}
              icon="person-outline"
              label={t('common.yourPhoto')}
              onPress={() => setMode(MODES[0])}
            />
            <ModeButton
              active={mode === MODES[1]}
              icon="git-compare-outline"
              label={t('identify.sideBySide')}
              onPress={() => setMode(MODES[1])}
            />
            <ModeButton
              active={mode === MODES[2]}
              icon="images-outline"
              label={referenceLabel}
              onPress={() => setMode(MODES[2])}
            />
          </View>

          <View style={styles.referenceNav}>
            <TouchableOpacity
              style={styles.navButton}
              onPress={previous}
              disabled={usable.length < 2}
              accessibilityRole="button"
              accessibilityLabel={t('identify.previousReference')}
            >
              <Ionicons name="chevron-back" size={22} color={usable.length < 2 ? colors.textMuted : colors.text} />
            </TouchableOpacity>
            <View style={styles.referenceCount}>
              <Text style={styles.referenceCountText}>{`${index + 1} / ${usable.length}`}</Text>
              <Text style={styles.referenceKind}>{referenceLabel}</Text>
            </View>
            <TouchableOpacity
              style={styles.navButton}
              onPress={next}
              disabled={usable.length < 2}
              accessibilityRole="button"
              accessibilityLabel={t('identify.nextReference')}
            >
              <Ionicons name="chevron-forward" size={22} color={usable.length < 2 ? colors.textMuted : colors.text} />
            </TouchableOpacity>
          </View>

          {(reference.citation || reference.licenseName || reference.sourceUrl) && (
            <View style={styles.receipt}>
              {!!reference.citation && <Text style={styles.credit}>{reference.citation}</Text>}
              {!!reference.licenseName && <Text style={styles.license}>{reference.licenseName}</Text>}
              {!!reference.sourceUrl && (
                <TouchableOpacity
                  style={styles.sourceLink}
                  onPress={() => Linking.openURL(reference.sourceUrl)}
                  accessibilityRole="link"
                >
                  <Ionicons name="open-outline" size={15} color={colors.info} />
                  <Text style={styles.sourceText}>{t('common.readMore')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, paddingHorizontal: space.md, paddingBottom: space.md },
  header: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  headerCopy: { flex: 1 },
  title: { ...type.resultTitle, fontSize: 22 },
  subtitle: { ...type.caption, marginTop: 2 },
  closeButton: {
    width: control.minTouch,
    height: control.minTouch,
    borderRadius: control.minTouch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stage: {
    flex: 1,
    minHeight: 280,
    maxHeight: 520,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#020403',
    borderWidth: 1,
    borderColor: colors.border,
  },
  splitRow: { flex: 1, flexDirection: 'row', gap: 2 },
  photoPanel: { flex: 1, overflow: 'hidden', backgroundColor: '#020403' },
  photoPanelCompact: { flexBasis: '50%' },
  photo: { width: '100%', height: '100%' },
  photoLabel: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: space.sm,
    alignItems: 'center',
  },
  photoLabelText: {
    color: colors.white,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.68)',
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  modeBar: {
    flexDirection: 'row',
    gap: space.xs,
    paddingVertical: space.sm,
  },
  modeButton: {
    flex: 1,
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modeButtonActive: { backgroundColor: colors.accent + '24', borderColor: colors.accent + '88' },
  modeText: { flexShrink: 1, color: colors.textMuted, fontSize: 10.5, fontWeight: '700' },
  modeTextActive: { color: colors.text },
  referenceNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: control.minTouch,
    height: control.minTouch,
    borderRadius: control.minTouch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  referenceCount: { flex: 1, alignItems: 'center', paddingHorizontal: space.sm },
  referenceCountText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  referenceKind: { color: colors.info, fontSize: 11.5, fontWeight: '700', marginTop: 2 },
  receipt: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space.xs,
  },
  credit: { ...type.caption, color: colors.textSecondary, textAlign: 'center' },
  license: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },
  sourceLink: {
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  sourceText: { color: colors.info, fontSize: 12, fontWeight: '800' },
});
