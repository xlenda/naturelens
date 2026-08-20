import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';
import PressScale from './PressScale';
import { shareEntity } from './share';

// "Compartilhe sua planta" - tela principal rica (video do concorrente,
// 20/08). O concorrente fecha o resultado com um bloco de compartilhamento; a
// gente ja tinha o motor inteiro (components/share.js + shareCard.js) escondido
// atras de um icone de 20px na TopBar, que ninguem toca. O bloco aqui e o mesmo
// motor com cara de convite, no fim do scroll, onde a leitura acabou.
//
// A PREVIA e um espelho fiel do que renderShareCard desenha no canvas: foto do
// usuario, pilula da categoria, nome, cientifico, confianca e o rodape de marca
// com a URL - que e a parte que transforma um share em anuncio. Nada aqui
// mostra fato que o card compartilhado nao carrega: uma previa que promete mais
// do que a imagem entrega e uma mentira de UI.
//
// Nativo vs web: shareCard.js e web-only por construcao (desenha em <canvas>),
// entao no nativo o share sai como texto. A previa NAO depende disso - e uma
// View de React Native, identica nas duas plataformas -, entao o bloco nunca
// vira botao morto: no web ela mostra a imagem que vai sair, no nativo ela
// mostra o recorte da identificacao que acompanha o texto.
//
// Ausencia honesta (regra de ouro): sem entidade ou sem nome o bloco inteiro
// nao renderiza, e cada linha - foto, pilula, cientifico, confianca - so entra
// se o dado existir.
const BRAND = 'NatureLens';
const BRAND_URL = 'naturelensapp.cloud';

export default function ShareSpeciesCard({ entity, categoryLabel, accent }) {
  const { t } = useTranslation();
  if (!entity || !entity.name) return null;

  const color = accent || colors.accent;
  // Mesma regra do card: o latim so aparece quando ele NAO e o proprio nome
  // comum, senao a previa repete a mesma palavra em duas linhas.
  const showScientific = !!entity.scientific && entity.scientific !== entity.name;

  const onShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    shareEntity(entity, categoryLabel);
  };

  return (
    <View style={styles.block}>
      <Text style={styles.title} accessibilityRole="header">
        {t('common.shareThisResult')}
      </Text>

      {/* A previa e decorativa pro leitor de tela: nome, cientifico e confianca
          ja foram anunciados no topo do resultado, entao repetir aqui so faz o
          usuario de VoiceOver ouvir a mesma ficha duas vezes. O botao abaixo e
          que carrega o rotulo acionavel. */}
      <View
        style={styles.preview}
        accessibilityElementsHidden={true}
        importantForAccessibility="no-hide-descendants"
      >
        {!!entity.photoUri && (
          <Image source={{ uri: entity.photoUri }} style={styles.photo} resizeMode="cover" />
        )}
        <View style={styles.body}>
          {!!categoryLabel && (
            <View style={[styles.pill, { backgroundColor: color + '22' }]}>
              <Text style={[styles.pillText, { color }]} numberOfLines={1}>
                {categoryLabel}
              </Text>
            </View>
          )}
          <Text style={styles.name} numberOfLines={2}>
            {entity.name}
          </Text>
          {showScientific && (
            <Text style={styles.scientific} numberOfLines={1}>
              {entity.scientific}
            </Text>
          )}
          {entity.confidence != null && (
            <Text style={[styles.confidence, { color }]} numberOfLines={1}>
              {entity.confidence}% · {t('common.confidence')}
            </Text>
          )}
          <View style={styles.brandRow}>
            <Text style={styles.brand}>{BRAND}</Text>
            <Text style={[styles.brand, { color }]}>{BRAND_URL}</Text>
          </View>
        </View>
      </View>

      {/* Press-scale por wrapper EXTERNO (diagramacao-premium): o Touchable
          fica byte por byte, a11y e handler intactos. */}
      <PressScale>
        <TouchableOpacity
          style={[styles.btn, { borderColor: color }]}
          onPress={onShare}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('missions.pool.shareOne')}
        >
          <Ionicons
            name="share-social-outline"
            size={16}
            color={color}
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[styles.btnText, { color }]}>{t('missions.pool.shareOne')}</Text>
        </TouchableOpacity>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 20, marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10 },
  preview: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  // Faixa de foto, nao hero: a previa e um recibo do que vai sair, nao uma
  // segunda capa da tela.
  photo: { width: '100%', height: 132, backgroundColor: colors.surface },
  body: { padding: 14 },
  pill: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  name: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 8 },
  scientific: { fontSize: 13, fontStyle: 'italic', color: colors.textSecondary, marginTop: 2 },
  confidence: { fontSize: 12.5, fontWeight: '700', marginTop: 6 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  brand: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  btnText: { fontSize: 14, fontWeight: '800' },
});
