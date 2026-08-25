import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import BackChevron from './BackChevron';
import { colors, control, radius, space, type } from './theme';

const TWO_ACTION_SIDE_RESERVE = control.minTouch * 2 + space.xs + space.md;

// Shared screen header. 19 screens hand-copied this exact bar (16/700 title +
// 40x40 r12 icon buttons) and drift had already started: one screen grew an
// extra border on the buttons, four centred the title with flex tricks and the
// rest left it hugging the back button - with two actions on the right the
// title sat visibly off-centre. One component, one truth.
//
// The title lives on an absolute, pointerEvents:'none' layer so it stays
// optically centred no matter how many action buttons the screen renders -
// centring by flex can't do that with an asymmetric button count. The layer
// is padded past the widest real button group (2 buttons) and truncates with
// numberOfLines, so long titles never sit under a button.
export function TopBarIcon({ onPress, label, children, style }) {
  return (
    <TouchableOpacity
      style={[styles.iconBtn, style]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.8}
    >
      {children}
    </TouchableOpacity>
  );
}

export default function TopBar({ title, onBack, right }) {
  const { t } = useTranslation();
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <TopBarIcon onPress={onBack} label={t('common.goBack')}>
          <BackChevron size={22} color={colors.text} />
        </TopBarIcon>
      ) : (
        <View style={styles.iconGhost} />
      )}
      <View style={styles.titleLayer} pointerEvents="none">
        <Text style={styles.topTitle} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.actions}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
    minHeight: control.minTouch + space.xs,
  },
  titleLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: TWO_ACTION_SIDE_RESERVE,
    paddingBottom: space.xs,
  },
  topTitle: { ...type.topTitle },
  actions: { flexDirection: 'row', gap: space.xs },
  iconBtn: {
    width: control.minTouch,
    height: control.minTouch,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGhost: { width: control.minTouch, height: control.minTouch },
});
