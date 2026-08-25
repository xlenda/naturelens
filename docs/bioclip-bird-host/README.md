# Host mundial de aves com BioCLIP 2

Este diretório é um serviço autogerenciado, não um Space de demonstração nem
um endpoint gratuito. Ele classifica fotos contra a lista mundial de espécies
`Aves` do BirdNET+ Taxonomy/AviList e devolve **similaridade cosseno**, nunca
uma probabilidade inventada.

O NatureLens continua usando Nyckel enquanto o endpoint e um conjunto completo
de limiares calibrados não estiverem configurados. Mesmo depois da ativação, um
top-1 que não passe todas as provas cai no Nyckel e nunca vira nome principal.
BioCLIP só substitui o fallback depois de três provas no servidor NatureLens:

1. limiar de similaridade e margem top-1/top-2 definidos por um conjunto de
   validação nomeado;
2. taxon de nível `species` pertencente a `Aves` na lista AviList;
3. correspondência `EXACT`, `ACCEPTED`, `SPECIES`, `Aves` no GBIF, inclusive
   com o mesmo `usageKey`.

## Infraestrutura

- Recomendado: GPU NVIDIA com pelo menos 12 GB de VRAM, 16 GB de RAM e disco
  persistente de 10 GB.
- CPU: funciona com 16 GB de RAM, mas o primeiro preparo e cada identificação
  são muito mais lentos. Meça antes de colocar tráfego real.
- O primeiro boot baixa cerca de 1,6 GB de pesos, baixa mais de 10 mil aves e
  pré-calcula os embeddings de texto. Pode levar de 10 a 30 minutos. O volume
  `/data` evita repetir isso a cada reinício.
- Use um único worker por GPU. Escale por réplicas; vários workers duplicam o
  modelo na memória.

## Subir

```bash
docker build -t naturelens-bioclip-birds .
docker run --gpus all --rm -p 8080:8080 \
  -v naturelens-bioclip-cache:/data \
  -e BIOCLIP_BIRD_AUTH_TOKEN='troque-por-um-segredo-de-32-caracteres-ou-mais' \
  naturelens-bioclip-birds
```

O container expõe HTTP na rede interna. Coloque TLS em um proxy/load balancer
seu e limite o corpo da requisição a 13 MB. O endpoint configurado no
NatureLens precisa ser uma URL pública HTTPS, por exemplo:

```text
BIOCLIP_BIRD_ENDPOINT=https://birds.seudominio.com/v1/identify
BIOCLIP_BIRD_AUTH_TOKEN=mesmo-segredo-longo-do-host
```

Por segurança, o host recusa iniciar sem um token de ao menos 32 caracteres.
Se a autenticação já for garantida por mTLS ou por uma rede privada, a ausência
de token precisa ser uma decisão explícita com
`BIOCLIP_ALLOW_UNAUTHENTICATED=true`; nunca use essa opção num endpoint público.

O cliente recusa HTTP, IP literal, `localhost`, credenciais na URL, query,
fragmento e redirect. O host aceita no máximo três imagens JPEG/PNG/WebP do
mesmo indivíduo, mantém essas imagens apenas em memória e não registra o corpo.

Para CPU, remova `--gpus all` e use `-e BIOCLIP_DEVICE=cpu`. Para travar versões
reprodutíveis, os defaults atuais são:

```text
BIOCLIP_MODEL_REVISION=2957b322090f9cb17ae72c71981c7218a28d81e0
BIRDNET_TAXONOMY_VERSION=v0.3-Jul2026
```

Quando a taxonomia pública mudar, o boot falha de propósito até a versão ser
revisada e atualizada. Isso impede trocar silenciosamente os rótulos do modelo.

## Calibrar antes de liberar identidade exata

BioCLIP 2 é zero-shot. O `score` retornado é cosseno e não tem significado de
“87% de chance”. Monte um conjunto independente, mundial e sem imagens de
treino conhecidas, contendo:

- espécies comuns e raras de todas as regiões;
- fêmeas, juvenis, plumagem não reprodutiva e fotos ruins;
- espécies visualmente próximas;
- imagens sem ave e aves fora de enquadramento.

Separe calibração e teste final. Escolha os dois limiares no primeiro conjunto,
congele-os, meça no segundo e registre versão do modelo, versão AviList,
amostra, acurácia top-1, cobertura, erro por região e taxa de falso `exact`.
Só então configure no projeto NatureLens:

```text
BIOCLIP_BIRD_THRESHOLD_SET_ID=global-birds-v1
BIOCLIP_BIRD_MIN_SIMILARITY=<valor-medido>
BIOCLIP_BIRD_MIN_MARGIN=<valor-medido>
```

Sem as três variáveis o adaptador permanece desativado. Abaixo dos limiares ou
sem prova GBIF, o app descarta o candidato BioCLIP e usa o fallback Nyckel; ele
não libera dossiê, mapa, galeria nem afirmação de espécie.

## Contrato e teste manual

```bash
curl -X POST https://birds.seudominio.com/v1/identify \
  -H 'Authorization: Bearer troque-por-um-segredo-de-32-caracteres-ou-mais' \
  -H 'Content-Type: application/json' \
  -H 'X-NatureLens-Contract: 1' \
  --data '{"schemaVersion":1,"images":["data:image/jpeg;base64,..."],"topK":3}'
```

A resposta contém `modelRevision`, versão da taxonomia, `scoreType` igual a
`cosine_similarity`, ao menos dois candidatos ordenados e `topMargin`. O
adaptador do app valida tamanho, MIME, contrato, classe `Aves`, rank `species`,
binômio, `gbifKey`, ordenação e a margem recalculada.

## Fontes e licenças

- [BioCLIP 2 model card](https://huggingface.co/imageomics/bioclip-2): modelo
  `imageomics/bioclip-2`, licença MIT; o card também alerta para desequilíbrio
  dos dados e contra confiança excessiva no resultado.
- [BirdNET+ Taxonomy](https://github.com/birdnet-team/birdnet-taxonomy): código
  MIT e API de metadados. A lista cobre todas as aves e mantém somente nível de
  espécie.
- [AviList v2025](https://www.avilist.org/): taxonomia e nomes mundiais de aves,
  CC BY 4.0. Preserve a atribuição em qualquer redistribuição do cache.
- GBIF Species Match API: confirmação taxonômica externa; o app consulta apenas
  o candidato superior que já passou pelos limiares.

O fato de os componentes de software serem permissivos não torna a previsão
infalível. Identificação visual continua sendo apoio, não laudo de segurança,
manejo, consumo ou conservação.
