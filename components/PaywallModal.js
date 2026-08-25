import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, shadow } from './theme';
import { PLAN_PRICES, PLAN_ORDER, getPlanSavingPercent, isCheckoutConfigured } from './subscription';

// Per-plan i18n suffix and billing-period label. Kept as data so adding a
// fourth plan is one line here plus its prices, not another copy-pasted card.
const PLAN_META = {
  monthly: { labelKey: 'paywall.monthlyPlan', perKey: 'paywall.perMonth' },
  quarterly: { labelKey: 'paywall.quarterlyPlan', perKey: 'paywall.perQuarter' },
  annual: { labelKey: 'paywall.annualPlan', perKey: 'paywall.perYear' },
};

export default function PaywallModal({ visible, title, body, categoryLabel, accent = colors.accent, subscribing, onSubscribe, onCancel }) {
  const { t } = useTranslation();
  // Annual pre-selected: it is the best value and the plan the savings badge
  // points at, so defaulting anywhere else would argue against itself.
  const [plan, setPlan] = useState('annual');

  if (!visible) return null;

  const symbol = '$';
  const configured = isCheckoutConfigured();

  // No build de loja ate texto de direcionamento vira risco de politica quando
  // o produto nao usa Play Billing. O limite aparece sem preco, plano, site ou
  // verbo de compra; restauracao continua disponivel no Perfil.
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Titulo fixo e neutro: props vindas da web podem dizer "assine" ou
              "desbloqueie". Reaproveita-las aqui recriaria a CTA sem botao. */}
          <Text style={styles.title}>{t('paywall.title')}</Text>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Text style={styles.cancelBtnText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>{title || t('paywall.title')}</Text>
        <Text style={styles.body}>{body || t('paywall.body', { category: categoryLabel })}</Text>

        <View style={styles.planRow}>
          {PLAN_ORDER.map((key) => {
            const meta = PLAN_META[key];
            // Computed from the real prices every render, so the badge can
            // never drift away from what the cards actually say.
            const savePercent = getPlanSavingPercent(key);
            const selected = plan === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.planCard,
                  selected && { borderColor: accent, backgroundColor: accent + '14' },
                ]}
                onPress={() => setPlan(key)}
                disabled={subscribing}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t(meta.labelKey)}
              >
                {savePercent > 0 && (
                  <View style={[styles.saveBadge, { backgroundColor: accent }]}>
                    <Text style={styles.saveBadgeText} numberOfLines={1}>
                      {t('paywall.saveBadge', { percent: savePercent })}
                    </Text>
                  </View>
                )}
                <Text style={styles.planLabel}>{t(meta.labelKey)}</Text>
                <Text style={styles.planPrice}>{symbol}{PLAN_PRICES[key]}</Text>
                <Text style={styles.planPer}>{t(meta.perKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* An unconfigured checkout would render a button that goes nowhere.
            Saying so is better than a dead tap on a payment screen. */}
        {!configured && <Text style={styles.notConfigured}>{t('paywall.notAvailableYet')}</Text>}

        <TouchableOpacity
          style={[
            styles.subscribeBtn,
            { backgroundColor: accent },
            (subscribing || !configured) && { opacity: 0.5 },
          ]}
          onPress={() => onSubscribe(plan)}
          disabled={subscribing || !configured}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('paywall.subscribe')}
        >
          <Text style={styles.subscribeBtnText}>
            {subscribing ? t('paywall.subscribing') : t('paywall.subscribe')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          disabled={subscribing}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 1000,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.text, marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  planRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  planCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    // paddingTop maior que o de baixo: o selo de economia flutua em top:-10
    // e, quando o texto quebrava em duas linhas, ele COBRIA o nome do plano
    // ('Trimestral' e 'Anual' sumiam - print do dono, 20/08). Com o selo em
    // uma linha so (numberOfLines) e este respiro, os dois convivem.
    paddingTop: 20,
    paddingBottom: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    position: 'relative',
  },
  // Sizes stepped down from the two-card version: three cards share the same
  // row width, so the label and price have to fit ~100px instead of ~155px.
  planLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 4, textAlign: 'center' },
  planPrice: { fontSize: 18, fontWeight: '800', color: colors.text },
  planPer: { fontSize: 10.5, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  notConfigured: {
    color: colors.warning,
    fontSize: 12.5,
    textAlign: 'center',
    marginBottom: 12,
  },
  saveBadge: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  saveBadgeText: { color: colors.white, fontWeight: '800', fontSize: 10.5 },
  subscribeBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  subscribeBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { color: colors.textMuted, fontWeight: '600', fontSize: 13.5 },
});
