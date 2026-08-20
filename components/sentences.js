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
// Escrita sem ponto final (chines, japones, arabe) devolve o texto inteiro
// como uma frase so: nao ha o que colapsar, e o componente entao mostra tudo.
const ABBREV = /(\s|^)([A-Z]|cv|sp|ssp|subsp|var|f|e\.g|i\.e|approx|Dr|Sr|Sra|Mr|Mrs|St|no)\.$/i;

export function splitSentences(text) {
  if (typeof text !== 'string' || !text.trim()) return [];

  const pieces = text.trim().match(/[^.!?]+(?:[.!?]+|$)/g) || [];
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
    if (previous && (ABBREV.test(previous) || sentence.length < 15)) {
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
