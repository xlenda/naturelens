import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from './theme';

// The competitor's fixed bottom action bar on the result: New (retake) |
// Share | the dominant green Save pill - conversion one tap away at any
// scroll position, replacing the single-purpose SaveFab on detail screens.
//
// Same layout law as the FABs: absolute WITHIN the screen (never over the
// dock), and the host screen adds bottom padding to its scroll content.
export default function ResultActionBar({
  onNew,
  onShare,
  onSave,
  saved,
  savedId,
  accent = colors.accent,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const openSpecimen = () => {
    // savedId identifica O EXEMPLAR salvo. Resolver pelo id do provedor abriria
    // o registro errado quando a mesma especie fosse salva mais de uma vez.
    if (!savedId) return;
    const parent = navigation.getParent?.();
    if (parent) {
      parent.navigate('Collection', {
        screen: 'Specimen',
        params: { savedId },
      });
    } else {
      navigation.navigate('Specimen', { savedId });
    }
  };

  // Auditoria de diagramacao 20/08: com o dock escondido nas telas de detalhe,
  // esta barra passou a ser o ultimo elemento antes da borda fisica da tela - e
  // era o dock que carregava o respiro da area segura. Todas as telas usam
  // SafeAreaView com edges={['top']} apenas, entao o inset de baixo tem que
  // entrar aqui, senao o botao Salvar fica embaixo da barra de gestos do
  // iPhone. Uma guarda no componente compartilhado cobre as 8 telas de detalhe
  // de uma vez. Na web e no Android sem barra de gestos insets.bottom = 0 e o
  // valor antigo (12) continua valendo, entao nada muda visualmente ali.
  return (
    // box-none: a barra flutua sobre o scroll, entao sem isto os ~80px de
    // baixo da tela viravam faixa MORTA - o polegar descansa exatamente ali,
    // e um arrasto comecado nessa faixa nao rolava nada porque batia na barra
    // em vez do ScrollView. Com box-none a View so desenha; o toque atravessa
    // e apenas os BOTOES dentro dela continuam clicaveis (auditoria 20/08).
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none"
    >
      {!!onNew && (
        <TouchableOpacity
          style={styles.secondary}
          onPress={onNew}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('detail.actionNew')}
        >
          <Ionicons name="camera-outline" size={19} color={colors.text} />
          <Text style={styles.secondaryText}>{t('detail.actionNew')}</Text>
        </TouchableOpacity>
      )}
      {!!onShare && (
        <TouchableOpacity
          style={styles.shareAction}
          onPress={onShare}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('common.shareThisResult')}
        >
          <Ionicons name="share-social-outline" size={19} color={colors.text} />
          <Text style={styles.secondaryText} numberOfLines={1}>{t('common.shareThisResult')}</Text>
        </TouchableOpacity>
      )}
      {/* Salvar cria continuidade: a CTA abre o registro pessoal em vez de
          virar uma confirmacao morta ou uma exclusao gigante no mesmo lugar. */}
      <TouchableOpacity
        style={[styles.primary, { backgroundColor: accent }, saved && styles.primarySaved]}
        onPress={saved ? openSpecimen : onSave}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={saved ? t('specimen.openRecord') : t('common.saveToCollection')}
      >
        <Ionicons name={saved ? 'reader-outline' : 'bookmark'} size={17} color={colors.white} />
        <Text style={styles.primaryText} numberOfLines={1}>
          {saved ? t('specimen.openRecord') : t('common.saveToCollection')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: colors.background + 'F2',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 13,
    height: 46,
  },
  shareAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 118,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 11,
    height: 46,
  },
  secondaryText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 14,
    height: 46,
  },
  primarySaved: { opacity: 0.85 },
  primaryText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
