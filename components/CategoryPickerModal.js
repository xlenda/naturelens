import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import CategoryIcon from './CategoryIcon';
import { colors, control, radius, shadow, space, type } from './theme';

// Todas as categorias precisam aparecer de uma vez. Esconder parte delas numa
// faixa lateral tornou peixe, passaro e som praticamente invisiveis no celular.
export default function CategoryPickerModal({ visible, options, onSelect, onClose }) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={styles.card}
          accessibilityViewIsModal={true}
          onAccessibilityEscape={onClose}
        >
          <Text style={styles.title} accessibilityRole="header">
            {t('identify.switchCategoryTitle')}
          </Text>
          <Text style={styles.message}>{t('identify.switchCategoryMessage')}</Text>

          <ScrollView
            style={styles.optionsScroll}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          >
            {options.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.option,
                  option.selected && {
                    borderColor: option.accent,
                    backgroundColor: option.accent + '22',
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => onSelect(option)}
                onLongPress={option.onLongPress}
                accessibilityRole="button"
                accessibilityLabel={option.accessibilityLabel || option.label}
                accessibilityState={{ selected: option.selected }}
              >
                <View style={[styles.optionIcon, { backgroundColor: option.accent + '22' }]}>
                  {option.icon}
                </View>
                <Text style={styles.optionLabel} numberOfLines={2}>
                  {option.label}
                </Text>
                {option.selected ? (
                  <CategoryIcon name="checkmark-circle" size={18} color={option.accent} />
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={styles.cancelButton}
            activeOpacity={0.8}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Text style={styles.cancelLabel}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '90%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    ...shadow,
  },
  title: { ...type.sectionTitle, marginTop: 0, marginBottom: space.xxs, textAlign: 'center' },
  message: { ...type.body, textAlign: 'center', marginBottom: space.md },
  optionsScroll: { maxHeight: 280 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  option: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: control.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  cancelButton: {
    minHeight: control.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
});
