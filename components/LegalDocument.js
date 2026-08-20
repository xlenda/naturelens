import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from './theme';

// LegalDocument — renderiza um documento legal completo de legalTexts.js.
// Compartilhado por PrivacyScreen e TermsScreen (decisao de 19/08/2026: o
// in-app passa a mostrar o documento juridico inteiro, como o concorrente,
// e nao so o resumo). Tabelas viram linhas empilhadas com borda fina —
// padrao mobile, sem lib nova. Todo acesso a dados tem fallback (|| [])
// para nunca quebrar a tela se uma secao vier malformada.

function TableBlock({ headers, rows }) {
  const heads = headers || [];
  return (
    <View style={styles.table}>
      {(rows || []).map((row, i) => (
        <View key={i} style={styles.tableRow}>
          {(row || []).map((cell, c) => (
            <View key={c} style={c > 0 ? styles.tableCellPair : null}>
              {heads[c] ? <Text style={styles.tableHeader}>{heads[c]}</Text> : null}
              <Text style={styles.tableCell}>{cell}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function LegalDocument({ langLabel, sections }) {
  return (
    <View>
      {langLabel ? <Text style={styles.langLabel}>{langLabel}</Text> : null}
      {(sections || []).map((section, i) => (
        <View key={i} style={styles.docSection}>
          {section && section.heading ? (
            <Text style={styles.heading}>{section.heading}</Text>
          ) : null}
          {((section && section.blocks) || []).map((block, j) => {
            if (!block) return null;
            if (block.type === 'li') {
              return (
                <View key={j} style={styles.liRow}>
                  <Text style={styles.liDot}>{'•'}</Text>
                  <Text style={styles.liText}>{block.text}</Text>
                </View>
              );
            }
            if (block.type === 'table') {
              return <TableBlock key={j} headers={block.headers} rows={block.rows} />;
            }
            return (
              <Text key={j} style={styles.p}>
                {block.text}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  langLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  docSection: { marginBottom: 20 },
  heading: {
    fontSize: 15.5,
    fontWeight: '700',
    color: colors.accentLight,
    marginBottom: 8,
  },
  p: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  liRow: { flexDirection: 'row', marginBottom: 8, paddingLeft: 4 },
  liDot: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
    marginRight: 8,
  },
  liText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  table: { marginBottom: 10 },
  // Tabela como linhas empilhadas: cada <tr> vira um cartao com borda fina,
  // e cada celula ganha o proprio header em bold acima (nao cabem colunas
  // reais em tela estreita).
  tableRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  tableCellPair: { marginTop: 8 },
  tableHeader: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  tableCell: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
