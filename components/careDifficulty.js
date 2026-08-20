// Paridade 120% (video do concorrente, 20/08): o card dele carimba
// "Facil / Resistencia Alta / Manutencao Baixa" em cima da ESPECIE. Esse dado
// nao existe aqui - a Kindwise nao manda dificuldade - e chutar "facil" numa
// planta que o usuario vai matar em duas semanas seria a mentira mais cara do
// app inteiro.
//
// O que EXISTE com fonte lida e a exigencia por GRUPO: os dossies em
// docs/agronomia/grupos/*.md comparam os grupos entre si em insumo, em margem
// de erro e em recorrencia de manejo, sempre citando extensao universitaria.
// Este modulo e so essa tabela, com a frase do dossie que justifica cada linha.
// Grupo fora da tabela devolve null e o card nao renderiza - mesma regra do
// shortFact.js: card ausente e melhor que card inventado.
//
// DUAS ESCALAS SEPARADAS, e o dossie de lenhosas e a prova de que elas nao
// andam juntas: "e o grupo de MENOR exigencia de insumo e de MAIOR custo de
// erro". Uma arvore madura quase nao da trabalho e mesmo assim nao e planta de
// iniciante, porque o erro nao se corrige na estacao seguinte.
//
//   level:       1 facil | 2 moderado | 3 exigente  -> margem de erro
//   maintenance: 1 baixa | 2 media    | 3 alta      -> recorrencia do manejo
//
// SO OS 8 GRUPOS DE PLANTA de casa/jardim entram. "Dificuldade de cuidar" so
// quer dizer alguma coisa onde existe cuidado: passaro, peixe, inseto e
// cogumelo caem no null de proposito, e lavoura comercial (grainCrop/vegCrop)
// tambem - la o manejo e decisao de agronomo com analise de solo, nao de um
// card de tres palavras.
//
// SEM SAZONALIDADE aqui de proposito: nada nesta tabela e mes do calendario,
// entao ela vale igual nos dois hemisferios (a licao do corpus: ancorar em
// estacao/equador, nunca em "marco a novembro").

const CARE_BY_GROUP = {
  // "regar ate encharcar ... e entao deixar o substrato secar completamente
  // antes de regar de novo - tipicamente a cada 2-3 semanas" e adubo a
  // "metade ou um quarto da dose recomendada" (Iowa State, via
  // suculentas-e-cactos.md). Intervalo de semanas + dose reduzida = o menor
  // trabalho recorrente do conjunto, e o tecido de reserva perdoa o
  // esquecimento (o que NAO perdoa e o excesso - vai no manual, nao no card).
  succulent: { level: 1, maintenance: 1 },

  // "Isso inverte a logica de todos os outros grupos - aqui, fertilidade alta e
  // prejuizo": "Very fertile soils tend to produce lush leaves that lack
  // flavor" (Clemson - Herbs, via ervas-aromaticas.md). Alecrim "depois de
  // estabelecido no solo, nao precisa de rega" (RHS). Insumo minimo.
  // Nao e level 1 porque o proprio dossie chama de "erro estrutural do grupo"
  // tratar mediterraneas e folhosas com o mesmo calendario de rega.
  herb: { level: 2, maintenance: 1 },

  // "e o grupo de menor exigencia de insumo e de maior custo de erro"; planta
  // madura pede "pouca ou nenhuma" adubacao (Clemson - Fertilizing Trees &
  // Shrubs), mas o estabelecimento se mede em ANOS - "cerca de 1 ano por
  // polegada de diametro do tronco" (Penn State), via
  // arvores-e-arbustos-lenhosos.md. Manutencao baixa, margem de erro nao.
  woody: { level: 2, maintenance: 1 },

  // "Exigencia nutricional intermediaria e explicitamente limitada" - 1 libra
  // de 10-10-10 por 100 pes^2 a cada 6 semanas (Clemson - Annuals/Perennials),
  // e "a operacao que define o grupo e o deadheading", que e trabalho que
  // volta toda semana da floracao (floriferas-e-ornamentais.md).
  flowering: { level: 2, maintenance: 2 },

  // "O denominador comum ... e a origem ecologica: luz filtrada por copas,
  // calor constante". Marantaceae exige "pelo menos 60%" de umidade e e
  // "intolerante a mudancas bruscas de temperatura e correntes de ar"
  // (NC State) - "o subgrupo mais exigente e o que mais aproxima este grupo do
  // de samambaias" (folhagens-tropicais-de-interior.md).
  tropicalFoliage: { level: 2, maintenance: 2 },

  // "E o unico grupo em que a colheita retira nutriente do sistema todo ano" e
  // "o grupo com a maior exigencia nutricional, e ela e recorrente": macieira
  // madura leva 6 xicaras de 33-0-0 TODO ANO (Clemson - Apple) e o tomate leva
  // cobertura QUINZENAL com proporcao que muda ao longo do ciclo (Embrapa).
  // A rega ainda tem janela fenologica - "errar a janela custa a safra
  // inteira" (frutiferas-e-hortalicas.md).
  fruitVeg: { level: 3, maintenance: 3 },

  // "E o grupo com a menor margem de erro em umidade e o unico onde a
  // fertilizacao normal ja e excesso" - primeira linha de
  // samambaias-e-plantas-de-sombra.md. Umidade constante do substrato E do ar,
  // com vaso duplo / bandeja de pedras / umidificador como metodos de rotina.
  fern: { level: 3, maintenance: 3 },

  // "Nao existe solo" - a raiz e orgao de fixacao e precisa de ar entre os
  // pulsos de agua, e o substrato "tem data de validade" (troca periodica).
  // Bromelia-tanque ainda pede "Flush the centers ... every week" (Wisconsin),
  // via orquideas-e-epifitas.md.
  orchid: { level: 3, maintenance: 3 },
};

/**
 * Perfil de exigencia do grupo curado (chaves de components/speciesGroup.js).
 *
 * @param {string|null} groupKey
 * @returns {{level: 1|2|3, maintenance: 1|2|3}|null} null quando o grupo e
 *          desconhecido ou nao e um grupo de planta cultivada - a tela nao
 *          renderiza o bloco nesse caso.
 */
export function getCareProfile(groupKey) {
  return (groupKey && CARE_BY_GROUP[groupKey]) || null;
}

/**
 * Uma checagem rodavel para as duas coisas que este arquivo realmente afirma:
 * o null honesto e a separacao entre as duas escalas.
 *
 *   node -e "import('./components/careDifficulty.js').then(m => console.log(m.selfCheck()))"
 */
export function selfCheck() {
  const eq = (got, want, msg) => {
    if (got !== want) throw new Error(`${msg}: expected ${want}, got ${got}`);
  };

  // Null honesto: sem grupo, grupo inexistente, e os grupos que nao sao de
  // planta cultivada (bicho, cogumelo e lavoura comercial).
  eq(getCareProfile(null), null, 'sem grupo');
  eq(getCareProfile('naoExiste'), null, 'grupo desconhecido');
  eq(getCareProfile('gardenBird'), null, 'passaro nao tem dificuldade de cuidado');
  eq(getCareProfile('pollinator'), null, 'inseto nao tem dificuldade de cuidado');
  eq(getCareProfile('vegCrop'), null, 'lavoura comercial fica fora');

  // As duas escalas sao independentes - se alguem colapsar as duas num numero
  // so, estas tres linhas quebram.
  eq(getCareProfile('woody').maintenance, 1, 'lenhosa: insumo minimo');
  eq(getCareProfile('woody').level, 2, 'lenhosa: custo de erro alto mesmo assim');
  eq(getCareProfile('succulent').level, 1, 'suculenta e a de iniciante');
  eq(getCareProfile('fern').level, 3, 'samambaia e a de menor margem de erro');

  // Toda linha da tabela tem que estar nas duas escalas 1..3.
  for (const [key, v] of Object.entries(CARE_BY_GROUP)) {
    if (![1, 2, 3].includes(v.level) || ![1, 2, 3].includes(v.maintenance)) {
      throw new Error(`${key}: fora da escala 1..3`);
    }
  }

  return 'careDifficulty: all checks passed';
}
