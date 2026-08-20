import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import { getManual, manualKeyFor } from './manualContent';

// Paridade 120% (video do concorrente, 20/08): o carrossel "Problemas Comuns"
// da tela principal dele. O conteudo NAO e novo - sao os `problems[]` do manual
// editorial por topico ({lang}-manual.json), ja escritos e ja traduzidos nos 17
// idiomas, que hoje so aparecem la dentro, em acordeao, depois de duas
// navegacoes. Aqui eles viram vitrine: o problema aparece na tela do resultado e
// o toque abre a aba certa do CareTopics COM aquele acordeao ja aberto.
//
// SEM FOTO DE SINTOMA, e este e o unico ponto em que ficamos abaixo do
// concorrente. Ele mostra folha amarelada, mancha, murcha. Nao temos banco de
// foto de sintoma, e ilustrar "Excesso de rega" com uma foto qualquer - gerada
// ou de outra especie - seria dar ao usuario um gabarito visual falso para
// diagnosticar a propria planta. Icone de alerta e a resposta honesta.
//
// FILTRO: so entram os topicos que a especie REALMENTE tem (a mesma lista que
// alimenta as abas do manual), na mesma ordem. Manual indisponivel, offline sem
// cache ou nenhum topico com problems[] -> null, o bloco some inteiro.

export default function CommonProblems({ topics, accent, onOpen }) {
  const { t, i18n } = useTranslation();
  const i18nLang = i18n.language;
  const [manual, setManual] = useState(null);

  useEffect(() => {
    let alive = true;
    getManual(i18nLang).then((m) => {
      if (alive) setManual(m);
    });
    return () => {
      alive = false;
    };
  }, [i18nLang]);

  if (!manual) return null;

  // Um verbete por aba, sem repetir: 'confusas' e 'safety' compartilham o
  // verbete de seguranca (manualKeyFor), e sem o Set a mesma dupla de cards
  // sairia duas vezes no carrossel.
  const seen = new Set();
  const cards = [];
  for (const topic of topics || []) {
    const manualKey = manualKeyFor(topic?.key);
    if (!manualKey || seen.has(manualKey)) continue;
    seen.add(manualKey);
    const problems = manual[manualKey]?.problems;
    if (!Array.isArray(problems)) continue;
    problems.forEach((problem, index) => {
      // Titulo e primeira linha do sintoma: sem os dois o card seria uma casca.
      const symptom = problem?.symptoms?.[0];
      if (!problem?.title || !symptom) return;
      cards.push({ key: manualKey + ':' + index, topicKey: topic.key, index, title: problem.title, symptom });
    });
  }

  if (cards.length === 0) return null;

  return (
    <View style={styles.block}>
      <Text style={styles.title} accessibilityRole="header">
        {t('detail.problemsLabel')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {cards.map((card) => (
          <TouchableOpacity
            key={card.key}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => onOpen?.(card.topicKey, card.index)}
            accessibilityRole="button"
            accessibilityLabel={card.title + '. ' + card.symptom}
          >
            <View style={[styles.icon, { backgroundColor: colors.warning + '22' }]}>
              <Ionicons
                name="alert-circle"
                size={16}
                color={colors.warning}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>{card.title}</Text>
            <Text style={styles.cardSymptom} numberOfLines={3}>{card.symptom}</Text>
            <View style={styles.more}>
              <Text style={[styles.moreText, { color: accent || colors.accent }]} numberOfLines={1}>
                {t('common.readMore')}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={13}
                color={accent || colors.accent}
                accessibilityElementsHidden={true}
                importantForAccessibility="no-hide-descendants"
              />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 16 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
  // paddingRight fecha o carrossel com respiro no ultimo card, senao ele
  // encosta na borda e parece cortado.
  strip: { gap: 10, paddingRight: 4 },
  card: {
    width: 190,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  cardSymptom: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 4 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
  moreText: { fontSize: 11.5, fontWeight: '700' },
});
