# ASO 2026 — NatureLens

Atualizado em 26 de agosto de 2026. Esta estratégia trata `NatureLens` como
marca provisória e `app.naturelens` como identificador técnico permanente. Uma
troca futura de marca não exige mudar o pacote Android nem perder a arquitetura
de palavras-chave.

## Posicionamento

**Promessa de busca:** identificar uma planta por foto.

**Promessa de produto:** transformar uma foto ou gravação em identidade,
evidência, segurança e um próximo passo útil.

**Território de marca:** uma lente confiável para toda a natureza — plantas,
árvores, lavouras, insetos, cogumelos, aves, peixes e sons.

O título captura a intenção mais forte e fácil de entender. A descrição curta
abre o escopo sem virar uma lista. A descrição completa prova profundidade,
segurança e diferenciação. Não usamos números de precisão ou quantidade de
espécies que não possam ser auditados.

## Arquitetura de palavras-chave

| Camada | Intenção | Termos pt-BR | Onde usar |
| --- | --- | --- | --- |
| Primária | Resolver agora | identificar plantas, identificador de plantas, planta por foto | título, primeira frase, captura 1 |
| Expansão | Identificar outros grupos | identificar insetos, cogumelos, aves, peixes, sons da natureza | descrição curta, primeiro parágrafo, captura 2 |
| Segurança | Evitar dano | planta tóxica para cachorro, planta tóxica para gato, cogumelo perigoso, alerta de risco | parágrafo de segurança, captura 3 |
| Cuidado | Manter e acompanhar | cuidado de plantas, rega, luz, solo, fertilização, lembrete | descrição completa, captura 4 |
| Profissional | Decidir no campo | agronomia, lavoura, adubação, fertilizantes, manejo integrado de pragas, MIP | descrição completa, captura 5 |
| Retenção | Voltar ao app | coleção, diário, histórico, passaporte, check-in, comunidade | segunda metade da descrição |

Não existe campo oculto de palavras-chave na Google Play. A indexação depende
principalmente do texto público e do comportamento real da ficha. Por isso os
termos entram em frases naturais e não são repetidos como uma lista.

## Metadados principais

- Título pt-BR: `NatureLens: Identificar Plantas`
- Título en-US: `NatureLens: Plant Identifier`
- Categoria inicial: Educação
- Marca na ficha: NatureLens
- Pacote imutável: `app.naturelens`

O título combina marca e intenção de busca dentro do limite de 30 caracteres.
Se a marca mudar, preservar a segunda metade localizada. Antes de renomear,
pesquisar disponibilidade na Play, domínio, redes sociais e marcas registradas.

## Ordem narrativa das capturas

1. **Identifique:** uma foto, até três ângulos, resultado claro.
2. **Entenda:** nome, evidência, confiança, alternativas e fontes.
3. **Proteja:** toxicidade para pessoas e pets e riscos relevantes.
4. **Acompanhe:** coleção, diário, lembretes e check-ins.
5. **Aprofunde:** cuidado por espécie e agronomia quando aplicável.

As peças atuais cobrem identificação, resultado, registro, descoberta e diário.
A próxima rodada visual deve substituir “descoberta genérica” por segurança para
pets e deixar a agronomia explícita. Toda imagem deve corresponder a uma tela
real do binário enviado.

## Experimentos de ficha

Rodar um experimento por vez, com no máximo duas variantes, tráfego dividido e
sem encerrar antes de haver volume suficiente.

### Experimento A — ícone

- Controle: ícone atual com o mascote.
- Variante: lente/folha com silhueta mais simples e contraste maior em 48 px.
- Hipótese: leitura imediata melhora visitas qualificadas sem perder identidade.

### Experimento B — primeira captura

- Controle: “Reconheça a natureza ao seu redor”.
- Variante: “Descubra qual planta é — por uma foto”.
- Hipótese: benefício explícito aumenta a conversão da visita em instalação.

### Experimento C — diferencial

- Controle: sequência atual.
- Variante: identificação → segurança para pets → todas as categorias → diário → agronomia.
- Hipótese: variedade e proteção tornam o NatureLens menos substituível.

Métrica principal: aquisição de primeira vez com retenção, não apenas clique de
instalação. Uma variante que aumenta instalações e piora o primeiro resultado
ou a retenção não é vencedora.

## Operação mensal

1. Exportar termos de aquisição e conversão do Play Console por país.
2. Separar marca, identificação, segurança, cuidado e agronomia.
3. Ler avaliações de 1–2 estrelas para promessa quebrada e de 4–5 para linguagem do usuário.
4. Atualizar uma hipótese por vez; não trocar título, ícone e capturas juntos.
5. Registrar data, país, variante, resultado e decisão em `aso-experiments.csv`.
6. Localizar primeiro pt-BR e en-US; ampliar as artes somente após validar a mensagem vencedora.

Para espanhol, usar `es-419` (América Latina) na primeira expansão. O recorte
competitivo tem mais avaliações em mercados latino-americanos do que em
Espanha; `es-ES` pode ser adicionado depois com revisão nativa própria.

## O que não prometer

- “100% preciso”, “a melhor IA” ou cobertura mundial total.
- Segurança para consumo de cogumelos baseada apenas em foto.
- Diagnóstico médico, veterinário ou agronômico definitivo.
- Dose de fertilizante sem cultura, região, fase, análise e fonte adequadas.
- Comunidade mundial ou backup de fotos enquanto a infraestrutura não provar isso.

## Critério de pronto para publicação

- Metadados passam pelos limites de 30/80/4.000 caracteres.
- Português e inglês foram revisados na ficha real, sem truncamento.
- Ícone e cinco capturas foram conferidos no aparelho e na prévia da Play.
- Formulários de acesso, conteúdo, dados e IA refletem o AAB final.
- Primeiro upload vai para teste interno; produção só após validação no Android real.
