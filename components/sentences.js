// Corte por frase SEM lookbehind.
//
// `(?<=[.!?])` e um SyntaxError de PARSE no Safari < 16.4 (todo iPhone em iOS
// 15 ou anterior). Nao quebra a tela que usa: mata o bundle inteiro e o app
// abre em BRANCO. Estava em tres arquivos diferentes; virou um helper so para
// nao voltar pela quarta copia (auditoria de 20/08).
//
// O merge de pedaco curto e o que evita cortar dentro de abreviacao
// ("Dr. Silva", "cv. Alba", "e.g. ..."): o pedaco seguinte a uma abreviacao
// e minusculo e volta pro anterior em vez de virar uma linha truncada - que,
// num aviso de toxicidade, e exatamente o pedaco que muda o sentido.
//
// Chines e japones terminam frase com 。！？ (largura cheia), nao com o ponto
// latino: sem eles no separador a descricao inteira virava UMA frase, o
// "Ver mais" nunca aparecia e o manual nunca virava topicos nesses idiomas.
// Escrita arabe usa o ponto latino e ja funcionava.
const ABBREV = /(\s|^)([A-Z]|cv|sp|ssp|subsp|var|f|e\.g|i\.e|approx|Dr|Sr|Sra|Mr|Mrs|St|no)\.$/i;

export function splitSentences(text) {
  if (typeof text !== 'string' || !text.trim()) return [];

  const pieces = text.trim().match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g) || [];
  const out = [];

  for (const piece of pieces) {
    const sentence = piece.trim();
    if (!sentence) continue;

    // Duas juncoes, so. Depois de uma abreviacao ("Dr.", "cv.") o corte seria
    // dentro da frase; e um farelo final ("Etc.", uma sigla solta) nao merece
    // virar linha propria. O caso perigoso - metade de um aviso visivel e a
    // outra metade escondida - foi resolvido onde nasceu: aviso de toxicidade
    // e de perigo nao passam mais por "Ver mais", renderizam inteiros.
    const previous = out[out.length - 1];

    // Numero decimal NAO e fim de frase. "Grows 1.5 m tall." era cortado em
    // "Grows 1." + "5 m tall." e remontado com espaco, entregando ao usuario
    // "Grows 1. 5 m tall." - texto CORROMPIDO na tela, nao so mal cortado.
    // A juncao e feita aqui em vez de no regex porque a forma natural de
    // resolver no regex e lookbehind, que derruba o app inteiro em iOS 15
    // (o motivo deste arquivo existir).
    const decimalPartido = previous && /\d\.$/.test(previous) && /^\d/.test(sentence);

    if (previous && decimalPartido) {
      out[out.length - 1] = previous + sentence; // sem espaco: e o mesmo numero
      continue;
    }

    // A regra de "farelo curto" e de escrita LATINA. Em chines e japones uma
    // frase inteira cabe em poucos caracteres ("喜阳。" = "gosta de sol"), entao o
    // limiar de 15 juntava a descricao toda de volta num bloco so - e ainda
    // colava um espaco que nao existe nessas escritas. Peca com terminador de
    // largura cheia ja e frase completa: nunca e farelo.
    const escritaCJK = /[　-鿿＀-￯]/.test(sentence);

    if (previous && !escritaCJK && (ABBREV.test(previous) || sentence.length < 6)) {
      out[out.length - 1] = previous + ' ' + sentence;
    } else {
      out.push(sentence);
    }
  }

  return out;
}

/** Primeira frase, ou null. Usado onde cabe uma linha so. */
export function firstSentence(text) {
  return splitSentences(text)[0] || null;
}
