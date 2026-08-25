// Referencias nao localizadas: o nome da instituicao e a URL sao identidade,
// enquanto o rotulo "Fonte" continua vindo do locale da interface. So ha
// entrada quando o dossie agronomico realmente foi construido daquela fonte.
const SOURCES = {
  succulent: {
    soil: [
      {
        label: 'Iowa State University Extension',
        url: 'https://yardandgarden.extension.iastate.edu/how-to/growing-succulents-indoors',
      },
    ],
  },
  tropicalFoliage: {
    soil: [
      {
        label: 'Clemson Cooperative Extension',
        url: 'https://hgic.clemson.edu/factsheet/philodendron-pothos-monstera/',
      },
      {
        label: 'Clemson Cooperative Extension',
        url: 'https://hgic.clemson.edu/factsheet/dracaena/',
      },
    ],
  },
  fern: {
    soil: [
      {
        label: 'Clemson Cooperative Extension',
        url: 'https://hgic.clemson.edu/factsheet/indoor-ferns/',
      },
      {
        label: 'UConn',
        url: 'https://homegarden.cahnr.uconn.edu/factsheets/growing-indoor-ferns/',
      },
    ],
  },
  fruitVeg: {
    soil: [
      {
        label: 'Embrapa',
        url: 'https://www.embrapa.br/hortalicas/tomate-de-mesa/adubacao',
      },
      {
        label: 'Clemson Cooperative Extension',
        url: 'https://hgic.clemson.edu/factsheet/apple/',
      },
    ],
  },
  flowering: {
    soil: [
      {
        label: 'Clemson Cooperative Extension',
        url: 'https://hgic.clemson.edu/factsheet/growing-perennials/',
      },
      {
        label: 'North Dakota State University Extension',
        url: 'https://www.ag.ndsu.edu/news/newsreleases/2023/august/dakota-gardener-the-myth-of-high-phosphorus-fertilizers-for-more-flowers',
      },
    ],
  },
  woody: {
    soil: [
      {
        label: 'Clemson Cooperative Extension',
        url: 'https://hgic.clemson.edu/factsheet/fertilizing-trees-shrubs/',
      },
    ],
  },
  orchid: {
    soil: [
      {
        label: 'American Orchid Society',
        url: 'https://www.aos.org/general-orchid-care-basics',
      },
      {
        label: 'Clemson Cooperative Extension',
        url: 'https://hgic.clemson.edu/repotting-your-orchid/',
      },
    ],
  },
  herb: {
    soil: [
      {
        label: 'Clemson Cooperative Extension',
        url: 'https://hgic.clemson.edu/factsheet/herbs/',
      },
    ],
  },
  grainCrop: {
    soil: [
      {
        label: 'Embrapa',
        url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/arroz/pre-producao/desordens-nutricionais',
      },
    ],
    uses: [
      {
        label: 'Embrapa',
        url: 'https://www.embrapa.br/agencia-de-informacao-tecnologica/cultivos/milho/producao/pragas-e-doencas/pragas/manejo-integrado-de-pragas',
      },
    ],
  },
  vegCrop: {
    watering: [
      {
        label: 'Embrapa',
        url: 'https://www.embrapa.br/hortalicas/berinjela/irrigacao',
      },
    ],
    soil: [
      {
        label: 'Embrapa',
        url: 'https://www.embrapa.br/hortalicas/cebola/deficiencias-nutricionais',
      },
    ],
    uses: [
      {
        label: 'Embrapa',
        url: 'https://www.embrapa.br/busca-de-publicacoes/-/publicacao/1148404/manejo-integrado-de-pragas-do-tomate-para-mesa',
      },
    ],
  },
};

export function getAgronomySources(groupKey, topicKey) {
  const rows = SOURCES[groupKey]?.[topicKey];
  return Array.isArray(rows) ? rows.slice() : [];
}
