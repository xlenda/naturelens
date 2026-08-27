import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import SectionCard from './SectionCard';

// "Duvidas frequentes" - paridade 120% (video do concorrente, 20/08).
//
// O concorrente fecha o resultado com um FAQ FIXO: as mesmas perguntas e as
// mesmas respostas enlatadas para toda especie, escritas uma vez e nunca mais
// olhadas. A vantagem que a gente ja tem instalada e uma especialista de
// verdade (Dra. Helena, screens/BotanistScreen.js, modelo real atras de
// api/ask.js). Entao aqui as perguntas sao SUGESTOES, nao respostas: cada
// linha abre o chat ja com a pergunta escrita e a especie como contexto.
//
// Por que isso nao viola "nada inventado" (regra 1): o bloco nao AFIRMA nada.
// Sao perguntas - moldes por categoria com o nome da especie interpolado. Nao
// existe aqui numero de adubacao, porte, floracao ou qualquer campo que a
// Kindwise nao manda; quem responde e a especialista, com o contexto em maos.
//
// Sazonalidade (regra 6): a unica pergunta com estacao ("no inverno") fala em
// ESTACAO, nunca em mes do calendario, entao vale igual nos dois hemisferios.
//
// Cogumelo: nenhuma pergunta pode induzir consumo. Os tres moldes de mushroom
// sao reconhecimento seguro, especies parecidas e onde/quando aparece - nunca
// "posso comer?".

// Tres por categoria, sempre. Sem mapa de categoria->perguntas em JS: o
// conteudo inteiro mora no i18n (detail.faq.<categoria>.q1..q3, nos 17
// idiomas), entao acrescentar/ajustar pergunta e mexer em locale, nao em codigo.
const QUESTION_KEYS = ['q1', 'q2', 'q3'];

export default function SpeciesFaq({ category, name, scientific, accent, navigation }) {
  const { t } = useTranslation();

  // Sem nome nao ha molde pra interpolar - o bloco simplesmente nao renderiza
  // (regra 1: sem dado, sem bloco).
  if (!name) return null;

  // defaultValue '' em vez do fallback do i18next: uma chave que faltasse
  // renderizaria a propria chave ("detail.faq.plant.q1") como pergunta.
  const questions = QUESTION_KEYS.map((key) =>
    t(`detail.faq.${category}.${key}`, { name, defaultValue: '' })
  ).filter((q) => q && q.trim());
  if (!questions.length) return null;

  const tint = accent || colors.accent;

  const ask = (question) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Mesmo formato de contexto que o gancho da especialista ja usa nas 7
    // telas de resultado; `prefill` cai direto no input do chat
    // (BotanistScreen le route.params.prefill e route.params.context).
    navigation.navigate('Botanist', {
      prefill: question,
      context: {
        display: name + ' (' + (scientific || '') + ')',
        name,
        scientific: scientific || '',
        category,
      },
    });
  };

  return (
    <SectionCard icon="help-circle-outline" title={t('detail.faq.title')} color={tint}>
      {questions.map((question, i) => (
        <TouchableOpacity
          key={i}
          style={[styles.row, i > 0 && styles.divider]}
          onPress={() => ask(question)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('botanist.askLabel', { question })}
        >
          <View style={[styles.badge, { borderColor: tint }]}>
            <Ionicons
              name="help"
              size={12}
              color={tint}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
            />
          </View>
          <Text style={styles.question}>{question}</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.textMuted}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
        </TouchableOpacity>
      ))}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    minHeight: 48,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  // O '?' quadrado do FAQ do concorrente (video, 20/08): quadrado de canto
  // arredondado, contorno na cor da categoria.
  badge: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  question: { flex: 1, color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
