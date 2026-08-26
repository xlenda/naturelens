import React, { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getSiteClimate } from './siteClimate';
import { colors, control, radius, space, type } from './theme';

function number(value, language, digits = 0) {
  if (!Number.isFinite(value)) return null;
  try { return new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value); }
  catch (e) { return String(Math.round(value)); }
}

function monthLabel(month, language) {
  try { return new Intl.DateTimeFormat(language, { month: 'short' }).format(new Date(2024, month - 1, 1)); }
  catch (e) { return String(month); }
}

const ClimateMonth = memo(function ClimateMonth({ item, maxRain, language, t }) {
  const rain = number(item.precipitationMmMonth, language);
  const temperature = number(item.temperatureMeanC, language, 1);
  const width = Number.isFinite(item.precipitationMmMonth) && maxRain > 0
    ? Math.max(3, Math.round((item.precipitationMmMonth / maxRain) * 100))
    : 0;
  return (
    <View style={styles.monthRow}>
      <Text style={styles.month}>{monthLabel(item.month, language)}</Text>
      <View style={styles.rainTrack}>{width > 0 ? <View style={[styles.rainFill, { width: `${width}%` }]} /> : null}</View>
      <Text style={styles.value}>{rain === null ? '—' : t('agronomyWorkspace.climate.rainValue', { value: rain })}</Text>
      <Text style={styles.temperature}>{temperature === null ? '—' : t('agronomyWorkspace.climate.temperatureValue', { value: temperature })}</Text>
    </View>
  );
});

export default function SiteClimateCard() {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState({ status: 'idle', data: null });
  const language = i18n.resolvedLanguage || i18n.language;
  const maxRain = useMemo(() => Math.max(0, ...(state.data?.months || []).map((item) => Number(item.precipitationMmMonth) || 0)), [state.data]);

  const load = async () => {
    if (state.status === 'loading') return;
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const data = await getSiteClimate();
      setState(data ? { status: 'ready', data } : { status: 'permission', data: null });
    } catch (e) {
      setState({ status: 'error', data: null });
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}><Ionicons name="partly-sunny-outline" size={21} color={colors.info} /></View>
        <View style={styles.copy}><Text style={styles.kicker}>{t('agronomyWorkspace.climate.kicker')}</Text><Text style={styles.title}>{t('agronomyWorkspace.climate.title')}</Text></View>
      </View>
      <Text style={styles.body}>{t('agronomyWorkspace.climate.body')}</Text>
      {state.status === 'ready' ? (
        <>
          <View style={styles.legend}><View style={styles.legendRain} /><Text style={styles.legendText}>{t('agronomyWorkspace.climate.rain')}</Text><Ionicons name="thermometer-outline" size={15} color={colors.warning} /><Text style={styles.legendText}>{t('agronomyWorkspace.climate.temperature')}</Text></View>
          <View style={styles.chart}>{state.data.months.map((item) => <ClimateMonth key={item.month} item={item} maxRain={maxRain} language={language} t={t} />)}</View>
          <View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={17} color={colors.accentLight} /><Text style={styles.noticeText}>{t('agronomyWorkspace.climate.privacy', { precision: state.data.grid.precisionDegrees })}</Text></View>
          <TouchableOpacity style={styles.source} onPress={() => Linking.openURL(state.data.source.url)} accessibilityRole="link"><Text style={styles.sourceText}>{t('agronomyWorkspace.climate.source')}</Text><Ionicons name="open-outline" size={16} color={colors.info} /></TouchableOpacity>
        </>
      ) : (
        <>
          {state.status === 'permission' ? <Text style={styles.message}>{t('agronomyWorkspace.climate.permission')}</Text> : null}
          {state.status === 'error' ? <Text style={styles.message}>{t('agronomyWorkspace.climate.error')}</Text> : null}
          <TouchableOpacity style={styles.action} onPress={load} disabled={state.status === 'loading'} accessibilityRole="button">
            {state.status === 'loading' ? <ActivityIndicator color={colors.background} /> : <Ionicons name="locate-outline" size={18} color={colors.background} />}
            <Text style={styles.actionText}>{t(state.status === 'error' ? 'common.retry' : 'agronomyWorkspace.climate.action')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: `${colors.info}55`, padding: space.md, marginBottom: space.md },
  heading: { flexDirection: 'row', alignItems: 'center' }, icon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: `${colors.info}1C`, alignItems: 'center', justifyContent: 'center', marginRight: space.sm }, copy: { flex: 1 },
  kicker: { color: colors.info, fontSize: 10.5, lineHeight: 14, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' }, title: { ...type.cardTitle }, body: { ...type.body, marginTop: space.sm },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md }, legendRain: { width: 14, height: 7, borderRadius: 4, backgroundColor: colors.info }, legendText: { color: colors.textMuted, fontSize: 10.5, marginRight: space.xs },
  chart: { marginTop: space.sm, gap: 5 }, monthRow: { flexDirection: 'row', alignItems: 'center', minHeight: 22 }, month: { width: 38, color: colors.textSecondary, fontSize: 10.5, textTransform: 'capitalize' }, rainTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' }, rainFill: { height: 7, borderRadius: 4, backgroundColor: colors.info }, value: { width: 58, textAlign: 'right', color: colors.textSecondary, fontSize: 10.5 }, temperature: { width: 55, textAlign: 'right', color: colors.warning, fontSize: 10.5, fontWeight: '800' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: `${colors.accent}12`, borderRadius: radius.sm, padding: space.sm, marginTop: space.md }, noticeText: { flex: 1, color: colors.textSecondary, fontSize: 11.5, lineHeight: 17 },
  source: { minHeight: control.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sourceText: { color: colors.info, fontSize: 12, fontWeight: '800' }, message: { color: colors.warning, fontSize: 12, lineHeight: 18, marginTop: space.sm },
  action: { minHeight: control.primaryHeight, borderRadius: radius.md, backgroundColor: colors.info, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: space.md }, actionText: { color: colors.background, fontSize: 13, fontWeight: '900' },
});
