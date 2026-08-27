# Moderacao da Comunidade NatureLens

A Comunidade so deve ser ativada publicamente depois de aplicar
`supabase-migration-community.sql` e definir uma pessoa responsavel pela fila.

## Rotina obrigatoria

- Verificar denuncias pelo menos uma vez por dia e antes de cada publicacao nas lojas.
- Remover imediatamente ameacas, assedio, spam, conteudo ilegal e orientacao perigosa.
- Suspender perfis reincidentes. Nao ocultar conteudo automaticamente por quantidade de
  denuncias: o identificador do aparelho nao prova que os denunciantes sao pessoas distintas.
- Guardar na nota uma justificativa curta, sem copiar dados pessoais desnecessarios.

## Comandos

Carregue as variaveis `EXPO_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` apenas no
terminal administrativo. A service role nunca entra no app, no Git ou em capturas de tela.

```powershell
npm run community:moderate -- list
npm run community:moderate -- remove post <uuid> "spam confirmado"
npm run community:moderate -- remove comment <uuid> "assedio confirmado"
npm run community:moderate -- suspend profile <uuid> "reincidencia"
npm run community:moderate -- dismiss post <uuid> "nao viola as regras"
```

`restore` e `activate` revertem uma decisao incorreta. Todo comando valida tipo e UUID,
confirma que o alvo existe e fecha as denuncias pendentes correspondentes.
