# Base de conhecimento da especialista

O chat usa Anthropic para redigir a resposta, mas os fatos tecnicos recuperados
vem somente dos documentos revisados em `docs/agronomia/`. Material de produto,
mercado, concorrentes, auditorias e arquivos de contexto nunca entra na ingestao.

## Fluxo

1. `npm run knowledge:ingest` separa os Markdown por secoes, extrai URLs citadas
   e nomes cientificos em italico e grava o hash SHA-256 do documento.
2. O Supabase indexa titulo e conteudo com full-text search em portugues.
3. `api/ask.js` busca ate cinco trechos pela pergunta, categoria e binomio exato.
4. Claude recebe os trechos como material citado, nao como instrucoes. Alegacoes
   numericas, toxicologicas e de manejo devem estar sustentadas pelos trechos.
5. A resposta devolve as fontes recuperadas; o app mostra links abaixo da fala.

O chat continua funcionando se a base estiver indisponivel, mas deve declarar
quando nao possui evidencia verificada para uma afirmacao especifica. O preflight
de producao exige esquema, pelo menos um documento publicado e uma busca real.

## Ativacao

1. Opcionalmente validar o acervo sem tocar no banco com
   `npm run knowledge:ingest -- --dry-run`.
2. Executar `supabase-migration-knowledge.sql` no SQL Editor do Supabase.
3. Rodar `npm run knowledge:ingest` no repositorio com `.env.check` configurado.
4. Rodar `npm run verify:db`.
5. Publicar exclusivamente com `npm run deploy`.

## Limite editorial

- Identificacao continua sendo feita pelos modelos especializados e confirmada
  por seus contratos taxonomicos; o chat nao altera a identidade.
- Um trecho de grupo nao vira conselho exato de especie.
- Fonte ausente nao e preenchida por memoria do modelo.
- Gemini e ElevenLabs nao participam desta arquitetura.
