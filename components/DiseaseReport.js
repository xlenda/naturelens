import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SectionCard from './SectionCard';
import IdentificationExtras from './IdentificationExtras';
import VendorSourceCredit from './VendorSourceCredit';
import { colors } from './theme';

const SEVERITY_COLORS = {
  low: colors.accent,
  mild: colors.accent,
  medium: colors.warning,
  moderate: colors.warning,
  high: colors.error,
  severe: colors.error,
};

function severityColor(severity) {
  if (!severity) return colors.textMuted;
  return SEVERITY_COLORS[severity.toLowerCase()] || colors.warning;
}

function TreatmentList({ title, items, color }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.treatmentGroup}>
      <Text style={[styles.treatmentTitle, { color }]}>{title}</Text>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={[styles.bullet, { backgroundColor: color }]} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function technicalText(value) {
  const values = Array.isArray(value) ? value : [value];
  const clean = values
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return clean.length ? clean.join(', ') : null;
}

function technicalId(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return Number.isFinite(value) ? String(value) : null;
}

export default function DiseaseReport({ disease, provider }) {
  const { t } = useTranslation();

  // The vendor answers a healthy plant with a pseudo-disease called "healthy",
  // which rendered as a report about nothing: the same word as title AND as the
  // italic scientific name right under it, plus a raw taxonomy pill ("Abiotic")
  // (auditoria de diagramacao 20/08). The root cause is cut in api/identify.js,
  // where the name is still English and unambiguous; this guard covers the finds
  // ALREADY saved in someone's collection, where the name came back translated
  // and no string test would work in 17 languages.
  //
  // Signature of the placeholder: name identical to the scientific name AND not
  // one field of content. A real report always carries at least one of these -
  // the check stays conservative on purpose, because hiding an actual disease
  // behind an all-clear is the one mistake that matters here.
  const isPlaceholder =
    disease &&
    !!disease.name &&
    disease.name === disease.scientific &&
    !disease.overview &&
    !disease.symptoms?.length &&
    !disease.treatment &&
    !disease.spreading &&
    !disease.url;

  if (!disease || isPlaceholder) {
    return (
      <SectionCard icon="checkmark-circle-outline" title={t('disease.healthStatusSection')} color={colors.accent}>
        <Text style={styles.body}>{t('disease.noDiseaseDetected')}</Text>
      </SectionCard>
    );
  }

  const sevColor = severityColor(disease.severity);
  const technicalRows = [
    { label: t('detail.commonNames'), value: technicalText(disease.commonNames) },
    { label: 'EPPO', value: technicalText(disease.eppoCode) },
    { label: 'GBIF', value: technicalId(disease.gbifId) },
  ].filter((row) => row.value);

  return (
    <View>
      <View style={styles.diseaseHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.diseaseName}>{disease.name}</Text>
          {/* Never the same word twice, once bold and once in italic - the same
              guard the alternatives rows already use (IdentificationExtras). */}
          {!!disease.scientific && disease.scientific !== disease.name && (
            <Text style={styles.diseaseSci}>{disease.scientific}</Text>
          )}
        </View>
        {Number.isFinite(disease.confidence) && (
          <View style={styles.diseaseConfidence}>
            <Text style={styles.confidenceLabel}>{t('disease.match')}</Text>
            <Text style={[styles.confidenceValue, { color: sevColor }]}>{disease.confidence}%</Text>
          </View>
        )}
      </View>

      <View style={styles.pillRow}>
        {!!disease.type && (
          <View style={[styles.typePill, { backgroundColor: colors.purple + '22' }]}>
            <Text style={[styles.typePillText, { color: colors.purple }]}>{disease.type}</Text>
          </View>
        )}
        {!!disease.severity && (
          <View style={[styles.typePill, { backgroundColor: sevColor + '22' }]}>
            <Ionicons name="warning-outline" size={13} color={sevColor} />
            {/* Cor pela severidade CRUA, texto pelo rotulo traduzido - mesma
                regra do cogumelo e do inseto: SEVERITY_COLORS casa a palavra
                em ingles, entao traduzir no lugar apagaria o vermelho de uma
                doenca grave (auditoria 20/08). */}
            <Text style={[styles.typePillText, { color: sevColor }]}>
              {t('disease.severitySuffix', { severity: disease.severityLabel || disease.severity })}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.diagnosisCaution}>
        <Ionicons name="search-outline" size={17} color={colors.warning} />
        <Text style={styles.diagnosisCautionText}>{t('disease.diagnosisCaution')}</Text>
      </View>

      {/* Guarded like every sibling: a healthy result has no overview text,
          and an empty titled card reads as a dead button (owner hit it). */}
      {!!disease.overview && (
        <SectionCard icon="document-text-outline" title={t('disease.overviewSection')} color={colors.info}>
          <Text style={styles.body}>{disease.overview}</Text>
          <VendorSourceCredit
            provider={provider}
            citation={disease.overviewCitation}
            licenseName={disease.overviewLicense}
            licenseUrl={disease.overviewLicenseUrl}
          />
        </SectionCard>
      )}

      <IdentificationExtras
        entity={{ similarImages: disease.similarImages }}
        accent={colors.warning}
        skipImages={0}
      />

      {disease.symptoms?.length > 0 && (
        <SectionCard icon="eye-outline" title={t('disease.symptomsSection')} color={colors.warning}>
          {disease.symptoms.map((s, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: colors.warning }]} />
              <Text style={styles.bulletText}>{s}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {!!disease.treatment && (
        <SectionCard icon="medkit-outline" title={t('disease.treatmentSection')} color={colors.info}>
          <TreatmentList title={t('disease.biological')} items={disease.treatment.biological} color={colors.accent} />
          <TreatmentList title={t('disease.chemical')} items={disease.treatment.chemical} color={colors.error} />
          <TreatmentList title={t('disease.prevention')} items={disease.treatment.prevention} color={colors.info} />
          {disease.treatment.chemical?.length > 0 && (
            <View style={styles.chemicalCaution}>
              <Ionicons name="shield-checkmark-outline" size={17} color={colors.warning} />
              <Text style={styles.chemicalCautionText}>{t('disease.chemicalCaution')}</Text>
            </View>
          )}
        </SectionCard>
      )}

      {!!disease.spreading && (
        <SectionCard icon="git-network-outline" title={t('disease.spreadingSection')} color={colors.purple}>
          <Text style={styles.body}>{disease.spreading}</Text>
        </SectionCard>
      )}

      {technicalRows.length > 0 && (
        <SectionCard icon="finger-print-outline" title={t('common.details')} color={colors.purple}>
          {technicalRows.map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue}>{row.value}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {!!disease.url && (
        <TouchableOpacity
          style={styles.linkBtn}
          activeOpacity={0.8}
          onPress={() => Linking.openURL(disease.url)}
        >
          <Ionicons name="globe-outline" size={18} color={colors.info} />
          <Text style={styles.linkBtnText}>{t('common.readMore')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  diseaseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  diseaseName: { fontSize: 18, fontWeight: '800', color: colors.text },
  diseaseSci: { fontSize: 13, fontStyle: 'italic', color: colors.textSecondary, marginTop: 2 },
  diseaseConfidence: { alignItems: 'center' },
  confidenceLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  confidenceValue: { fontSize: 18, fontWeight: '800' },
  diagnosisCaution: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: colors.warning + '14',
    borderWidth: 1,
    borderColor: colors.warning + '44',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  diagnosisCautionText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  typePillText: { fontSize: 12.5, fontWeight: '700', marginLeft: 6, textTransform: 'capitalize' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7, marginRight: 10 },
  bulletText: { flex: 1, color: colors.textSecondary, fontSize: 13.5, lineHeight: 19 },
  treatmentGroup: { marginBottom: 12 },
  treatmentTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  chemicalCaution: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 2,
  },
  chemicalCautionText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  infoValue: { flex: 1, color: colors.text, fontSize: 12.5, textAlign: 'right' },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  linkBtnText: { color: colors.info, fontWeight: '600', marginLeft: 8, fontSize: 14 },
});
