# Política de fontes agronômicas mundiais

Revisão jurídica e técnica: **24 de agosto de 2026**

Registro executável: [`components/globalAgronomySourceRegistry.js`](../components/globalAgronomySourceRegistry.js)

Teste de contrato: [`global-agronomy-source-registry.test.js`](../global-agronomy-source-registry.test.js)

## Objetivo e limite atual

Este documento define quais fontes mundiais o NatureLens pode usar e para qual finalidade. O registro é somente uma política: ele **não faz chamadas externas**, não instala SDKs e não ativa ingestão em tempo de execução.

O padrão é falhar fechado:

- fonte ausente do registro é desconhecida e não fornece dado;
- fonte `blocked` ou `quarantined` não fornece nenhum uso executável;
- uma fonte aprovada só fornece os usos presentes em `allowedUses`;
- Wikipedia fornece somente evidência descritiva secundária e rastreável;
- nenhuma fonte mundial registrada pode produzir uma recomendação;
- AquaCrop só pode calcular uma simulação quando todas as pré-condições auditadas forem verdadeiras.

## Vocabulário executável

### Estados

| Estado | Significado em produção |
| --- | --- |
| `approved` | Licença e finalidade permitem o uso declarado, ainda sujeito às limitações e à atribuição. |
| `blocked` | Há incompatibilidade comercial conhecida. Não integrar, copiar, redistribuir ou usar em cálculo. |
| `quarantined` | Direitos ou metadados ainda são ambíguos ou variam por camada/domínio. Fica desativada até revisão documentada. |

### Usos

| Uso | Significado |
| --- | --- |
| `identity` | Resolver uma identidade taxonômica; não acrescenta manejo por si só. |
| `descriptiveEvidence` | Exibir descrição secundária da espécie, com revisão e atribuição rastreáveis; nunca libera cálculo ou manejo. |
| `soilEstimate` | Mostrar estimativa espacial do solo com resolução, profundidade e incerteza. |
| `climateContext` | Mostrar contexto climático/reanálise; não é uma medição do talhão. |
| `calculation` | Executar um modelo determinístico com entradas completas e versão fixada. |
| `recommendation` | Prescrição ou decisão de manejo. Nenhuma fonte mundial está autorizada para isso. |

## Matriz de decisão

| ID no código | Fonte e papel | Estado | Licença auditada | Uso permitido | Decisão |
| --- | --- | --- | --- | --- | --- |
| `gbif` | GBIF — identidade | `approved` | CC BY 4.0 para o backbone; registros/mídias têm licenças próprias | `identity` | Aceitar apenas correspondência exata, aceita, em nível de espécie e no reino correto. |
| `wikipedia` | Wikipedia — evidência descritiva secundária | `approved` | CC BY-SA 4.0 | `descriptiveEvidence` | Consumir somente pelo dossiê do servidor; guardar artigo, revisão, data, atribuição, histórico e indicação de adaptação. Nunca usar em identidade, cálculo, recomendação, clima ou solo. |
| `soilgrids` | ISRIC SoilGrids — estimativa de solo | `approved` | CC BY 4.0 | `soilEstimate` | Ingerir futuramente no backend por WCS/WebDAV e conservar quantis/incerteza. |
| `agera5` | Copernicus AgERA5 v2 — contexto climático | `approved` | CC BY 4.0 | `climateContext` | Fonte climática primária; fixar versão e DOI em cada snapshot. |
| `nasa-power` | NASA POWER — contexto climático | `approved` | Política de dados NASA, sujeita a exceção indicada no produto | `climateContext` | Somente fallback, com cache, versão e data de recuperação. |
| `aquacrop` | FAO AquaCrop OS — modelo opcional | `approved` | BSD-3-Clause | `calculation` condicional | Desativado até fixar release/commit e auditar perfil calibrado da cultura. Nunca gera dose de adubo. |
| `worldclim` | WorldClim 2.1 | `blocked` | Termos não comerciais | nenhum | Excluir do app comercial; substituir por AgERA5/NASA POWER. |
| `ecocrop` | FAO EcoCrop legado | `blocked` | Sem licença comercial explícita; termos gerais FAO | nenhum | Não raspar. Base descontinuada e sem API/bulk suportado. |
| `gaez-v4` | FAO GAEZ v4 | `blocked` | CC BY-NC-SA 4.0 nos registros auditados | nenhum | A cláusula NC é incompatível com NatureLens comercial. |
| `faostat` | FAOSTAT — estatísticas nacionais | `quarantined` | Padrão CC BY 4.0, mas metadado por domínio e restrições extras FAO | nenhum | Só liberar um domínio após snapshot da licença e revisão jurídica. Nunca converter estatística nacional em dose no campo. |
| `gaez-v5` | FAO GAEZ v5 — aptidão/rendimento | `quarantined` | Reutilização comercial inequívoca não localizada para todas as camadas | nenhum | Exigir licença da camada e mapeamento exato de código de cultura. |
| `fao-crop-calendar` | FAO Crop Calendar | `quarantined` | API pública sem licença comercial explícita do dataset | nenhum | Exigir permissão escrita, snapshot versionado e mapeamento exato da cultura. |
| `wapor-v3` | FAO WaPOR v3 — água/produtividade | `quarantined` | Termos e direitos precisam ser confirmados por camada/canal | nenhum | Exigir revisão da camada exata; nunca tratar sensoriamento remoto como prescrição taxonômica. |

## Fontes primárias auditadas

### GBIF

- [Species API oficial](https://techdocs.gbif.org/en/openapi/v1/species)
- [GBIF Backbone Taxonomy](https://doi.org/10.15468/39omei)
- [Licença CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

O GBIF prova somente a identidade usada para escolher conteúdo específico. Nome popular, gênero, família, correspondência fuzzy ou candidata não desbloqueiam agronomia de espécie. O registro deve guardar nome canônico, chave do táxon, status do match, versão/data da fonte e a trilha de evidência. Licenças de ocorrências e fotografias são avaliadas separadamente; a aprovação de identidade não aprova mídia.

### Wikipedia

- [Política oficial de direitos autorais e atribuição](https://en.wikipedia.org/wiki/Wikipedia:Copyrights)
- [Licença CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- [Dumps oficiais da Wikimedia](https://dumps.wikimedia.org/)

A Wikipedia entra somente como evidência descritiva secundária de uma espécie que já tenha identidade exata confirmada por GBIF. O acesso planejado é `server-dossier`; o app não a consulta para calcular nem para preencher contexto de clima ou solo. Cada trecho precisa conservar URL do artigo, identificador da página, identificador da revisão, data de recuperação, link para o histórico/contribuidores, licença e indicação de cortes, tradução ou adaptação. Conteúdo adaptado deve cumprir o ShareAlike aplicável. A ausência dessa trilha faz o bloco não renderizar.

Esse uso não transforma uma seção editorial em verdade agronômica verificada. A interface deve chamá-la de conteúdo descritivo documentado e manter explícito que não é recomendação local, diagnóstico, dose, calendário ou evidência de campo.

### SoilGrids / ISRIC

- [Documentação oficial](https://docs.isric.org/globaldata/soilgrids/index.html)
- [Política de dados ISRIC](https://www.isric.org/about/data-policy)
- [WCS](https://docs.isric.org/globaldata/soilgrids/wcs.html)
- [WebDAV](https://docs.isric.org/globaldata/soilgrids/WebDav.html)

Cobertura mundial em 250 m e seis intervalos de profundidade até 200 cm. Inclui pH, carbono orgânico, densidade, fragmentos grossos, areia/silte/argila, CEC, nitrogênio total e quantis de incerteza. A interface futura deve dizer “estimativa de mapa de 250 m”, informar profundidade e exibir a incerteza. Não depender do REST beta em produção e não chamar o provedor diretamente do celular.

### Copernicus AgERA5 v2

- [Dataset oficial](https://cds.climate.copernicus.eu/datasets/sis-agrometeorological-indicators?tab=overview)
- [Série temporal oficial](https://cds.climate.copernicus.eu/datasets/sis-agrometeorological-indicators-timeseries?tab=overview)
- [CDS API](https://cds.climate.copernicus.eu/en/how-to-api)
- [Licença CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Cobertura mundial diária, aproximadamente 0,1 grau, de 1979 ao presente. Oferece temperatura, chuva, radiação, umidade, VPD, vento e evapotranspiração de referência FAO-56. É reanálise/indicador derivado e não observação do talhão. Uma ingestão futura deve fixar AgERA5 v2, DOI, parâmetros, janela temporal e data de recuperação.

### NASA POWER

- [Documentação da API](https://power.larc.nasa.gov/docs/services/api/)
- [Endpoint diário](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)
- [Metodologia e fontes](https://power.larc.nasa.gov/docs/methodology/)
- [Como citar](https://power.larc.nasa.gov/docs/referencing/)
- [Política de uso dos dados NASA](https://www.earthdata.nasa.gov/engage/open-data-services-software/data-use-policy)

É fallback por ser mais simples, porém mais grosseiro espacialmente. Resolução muda por parâmetro; respostas repetidas podem receber limite de uso e valores quase em tempo real podem ser revisados. Antes de ingerir um produto, confirmar que o metadado dele não declara uma exceção à política geral NASA. Mesmo quando não obrigatória, a citação de NASA POWER deve permanecer.

### AquaCrop Open Source

- [Página oficial FAO](https://www.fao.org/aquacrop)
- [Entradas exigidas](https://www.fao.org/aquacrop/overview/input-requirements/en)
- [Repositório do modelo](https://github.com/KUL-RSDA/AquaCrop)
- [Licença BSD-3-Clause](https://raw.githubusercontent.com/KUL-RSDA/AquaCrop/master/LICENSE)

A aprovação cobre apenas uma simulação opcional. Antes de qualquer cálculo, o chamador precisa provar simultaneamente:

1. `exactTaxon`: identidade exata da cultura;
2. `calibratedCropProfile`: perfil daquela cultura/cultivar calibrado e auditado;
3. `localInputs`: clima, solo, água e manejo locais completos;
4. `pinnedSourceVersion`: release ou commit do motor fixado e registrado.

Se um requisito faltar, `evaluateSourceUse()` retorna `missing-model-prerequisites`. AquaCrop não modela sozinho um programa nutricional completo e nunca autoriza recomendação de fertilizante.

### Fontes bloqueadas

- WorldClim: [dados v2.1](https://worldclim.org/data/worldclim21.html) e [termos oficiais](https://worldclim.org/about.html)
- EcoCrop: [descrição oficial](https://www.fao.org/land-water/resources/tools/databases/ecocrop/en), [aplicação legada](https://ecocrop.apps.fao.org/ecocrop/srv/en/home) e [termos gerais FAO](https://www.fao.org/contact-us/terms/)
- GAEZ v4: [portal oficial](https://www.fao.org/gaez/gaezv4/en) e [registro oficial com CC BY-NC-SA 4.0](https://data.fao.org/catalog/dataset/0d1c713c-37a0-4663-9c75-9fbfe9174132)

Uma fonte bloqueada só permanece no registro para impedir reintrodução acidental. Ela não é fallback.

### Fontes em quarentena

- FAOSTAT: [portal/desenvolvedor](https://www.fao.org/faostat/en/#developer-portal) e [termos das bases estatísticas](https://www.fao.org/contact-us/terms/db-terms-of-use/en)
- GAEZ v5: [portal](https://www.fao.org/gaez/en/), [dados](https://data.apps.fao.org/gaez/?lang=en) e [documentação do modelo](https://github.com/un-fao/gaezv5/wiki)
- FAO Crop Calendar: [API oficial](https://api-cropcalendar.apps.fao.org/) e [anúncio oficial](https://www.fao.org/plant-production-protection/news-and-events/news/news-detail/digitalization-for-impact-fao-introduces-enhanced-online-crop-calendar/)
- WaPOR v3: [dados](https://www.fao.org/in-action/remote-sensing-for-water-productivity/wapor-data/) e [acesso](https://www.fao.org/in-action/remote-sensing-for-water-productivity/wapor-data-access/en)

Para sair da quarentena, uma alteração futura precisa anexar ao registro: URL da licença da camada/domínio exato, versão ou snapshot, confirmação de uso comercial, atribuição obrigatória, limitações técnicas, mapeamento taxonômico/cultural e um teste que primeiro falhe com a fonte ainda fechada.

## Como aplicar o contrato

```js
const {
  SOURCE_USE,
  assertSourceUse,
  evaluateSourceUse,
} = require('./components/globalAgronomySourceRegistry');

assertSourceUse('soilgrids', SOURCE_USE.SOIL_ESTIMATE);

const decision = evaluateSourceUse('aquacrop', SOURCE_USE.CALCULATION, {
  exactTaxon: true,
  calibratedCropProfile: true,
  localInputs: true,
  pinnedSourceVersion: true,
});

if (!decision.allowed) {
  // O bloco consumidor nao renderiza e nenhum fallback inventa o resultado.
  return null;
}
```

Para fronteiras que não podem continuar silenciosamente, usar `assertSourceUse()`. A função lança `GLOBAL_AGRONOMY_SOURCE_USE_DENIED` com o motivo (`unknown-source`, `source-blocked`, `source-quarantined`, `use-not-allowed` ou `missing-model-prerequisites`). Nunca capturar esse erro para trocar por outra fonte não declarada.

## Proveniência mínima futura por fato

Quando a ingestão for implementada, cada fato persistido deverá carregar no mínimo:

```text
sourceId
sourceVersion
licenseId
retrievedAt
canonicalBinomial/taxonKey (quando o escopo for espécie)
locationCell e resolução (quando o escopo for espacial)
evidenceScope: species | crop-group | country | pixel
confidence/uncertainty
```

Um fato de país, grupo de cultura ou pixel nunca deve ser promovido a afirmação específica de espécie. O texto da interface deve distinguir estimativa, reanálise, estatística e simulação.

Para texto da Wikipedia, acrescentar também `pageId`, `revisionId`, `articleUrl`, `historyUrl`, `adaptationNotice` e a atribuição dos contribuidores. Sem esses campos, `descriptiveEvidence` deve falhar fechado.

## Regra para fertilizantes e outras recomendações

Nenhuma fonte desta lista autoriza gerar uma dose mundial de NPK a partir de uma foto. Uma prescrição exigiria, no mínimo, localização, espécie e cultivar confirmadas, estágio fenológico, análise laboratorial do solo, irrigação, meta de produtividade e regra técnica local. Enquanto essa cadeia não existir, a política permite somente contexto educativo claramente rotulado; dado ausente faz o bloco não renderizar.
