import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isWebUrl(value) {
  return /^https?:\/\/[^\s]+$/i.test(value || '');
}

function compactUrl(value) {
  return value
    .replace(/^https?:\/\/(?:www\.)?/i, '')
    .split(/[/?#]/)[0];
}

export default function VendorSourceCredit({ citation, licenseName, licenseUrl, provider }) {
  const { t } = useTranslation();
  const cleanCitation = cleanText(citation);
  const cleanLicense = cleanText(licenseName);
  const cleanLicenseUrl = cleanText(licenseUrl);
  const cleanProvider = cleanText(provider);
  const parts = [];

  if (cleanProvider) parts.push(cleanProvider);
  if (cleanCitation) parts.push(isWebUrl(cleanCitation) ? compactUrl(cleanCitation) : cleanCitation);
  if (cleanLicense && cleanLicense !== cleanCitation && cleanLicense !== cleanProvider) parts.push(cleanLicense);
  if (!parts.length && isWebUrl(cleanLicenseUrl)) parts.push(compactUrl(cleanLicenseUrl));
  if (!parts.length) return null;

  const label = t('detail.speciesCareSource', { citation: parts.join(' · ') });
  const target = isWebUrl(cleanCitation)
    ? cleanCitation
    : isWebUrl(cleanLicenseUrl)
      ? cleanLicenseUrl
      : null;

  // A atribuicao pertence ao texto do fornecedor. Sem evidencia recebida,
  // nada aparece; assim uma fonte de curadoria nunca parece fonte da foto.
  if (!target) return <Text style={styles.text}>{label}</Text>;

  return (
    <TouchableOpacity
      style={styles.link}
      activeOpacity={0.75}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => Linking.openURL(target)}
    >
      <Text style={[styles.text, styles.linkText]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start', marginTop: 10 },
  text: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 10 },
  linkText: { color: colors.info, textDecorationLine: 'underline', marginTop: 0 },
});
