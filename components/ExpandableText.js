import React, { useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from './theme';

// "Ver mais" para PROSA LONGA (auditoria de diagramacao 20/08).
//
// O manual de cada aba chegava como ~24 linhas corridas sem uma unica ancora:
// ninguem le, e - pior - o que vem DEPOIS do bloco (checklist, sinais de
// problemas) some sob a dobra e o usuario nunca descobre que existe. Aqui o
// bloco abre com os N primeiros filhos e o resto fica atras de um toque, o
// mesmo dispositivo dos acordeoes de problema.
//
// Recebe os filhos JA RENDERIZADOS por quem chama (paragrafo, bullet, o que
// for): o componente nao sabe nem quer saber o estilo da tela, e por isso
// serve tanto a prosa do vendor (frase-lider + bullets) quanto o manual
// editorial (paragrafos). Nada de render prop para uma coisa que children
// resolve.
//
// Chaves: common.readMore ja existia nos 17 idiomas (usada nos 4 detalhes);
// common.readLess foi criada no mesmo lote, tambem nos 17.
export default function ExpandableText({ children, text, textStyle, initial = 1, accent = colors.accent }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // toArray ja descarta null/false/undefined, entao um bloco condicional que
  // nao renderizou nao conta como paragrafo.
  let items = React.Children.toArray(children);

  // Um unico bloco de prosa (o caso do aviso de toxicidade: um <Text> com o
  // paragrafo inteiro do vendor) nao tinha o que cortar - toArray via 1 filho
  // e o componente devolvia tudo. Quando vem `text`, o corte e por FRASE: a
  // primeira abre, o resto entra no 'Ver mais'.
  if (typeof text === 'string' && text.trim()) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    items = sentences.map((sentence, i) => (
      <Text key={i} style={textStyle}>
        {sentence}
      </Text>
    ));
  }

  // Fallback (regra do app: dado ausente = bloco nao renderiza): se nao ha
  // nada para cortar, nao existe botao. Nunca um "Ver mais" que abre o vazio.
  if (items.length <= initial) return <>{items}</>;

  return (
    <>
      {open ? items : items.slice(0, initial)}
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t(open ? 'common.readLess' : 'common.readMore')}
      >
        <Text style={[styles.toggleText, { color: accent }]}>
          {t(open ? 'common.readLess' : 'common.readMore')}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={accent} />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingRight: 8,
  },
  toggleText: { fontSize: 13.5, fontWeight: '800' },
});
