const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// A politica que o app mostra e a que o Google le tem que ser a MESMA.
//
// components/legalTexts.js se declara "transcricao fiel" de public/privacy.html,
// mas sao dois arquivos separados que alguem atualiza a mao. Ja divergiram duas
// vezes: o paragrafo do GBIF entrou so no app, e o listing da Play Store aponta
// para o HTML - ou seja, a versao que o REVISOR le era a desatualizada, e a
// divergencia entre o que o app promete e o que a politica publicada diz e
// exatamente o tipo de coisa que derruba uma submissao.
//
// Este portao compara paragrafo a paragrafo. Nao exige formatacao igual - so
// que nenhuma frase exista de um lado e falte do outro.

const raizProjeto = __dirname;

function paragrafosDoJs(chave) {
  const fonte = fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8');
  const inicio = fonte.indexOf(`${chave}`);
  assert.ok(inicio > 0, `nao achei ${chave} em legalTexts.js`);
  // Ate a proxima declaracao de topo, para nao invadir o bloco seguinte.
  const resto = fonte.slice(inicio + chave.length);
  const fim = resto.search(/\n(export )?const [A-Za-z]/);
  const bloco = fim > 0 ? resto.slice(0, fim) : resto;

  return [...bloco.matchAll(/\{\s*type:\s*'p',\s*text:\s*`([^`]+)`/g)]
    .map((m) => m[1].trim())
    .filter((t) => !t.includes('${')); // paragrafo com interpolacao varia, nao da pra comparar literal
}

// Os dois lados passam pela MESMA normalizacao. Sem isso a comparacao acusa
// divergencia onde nao ha: o HTML escreve "1&nbsp;km" e poe <strong> no meio
// do paragrafo, entao tirar as tags deixa espaco duplo. Diferenca de marcacao
// nao e diferenca de conteudo - o que importa e a frase.
function normalizar(texto) {
  return texto
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function textoDoHtml(arquivo = 'privacy.html') {
  return normalizar(fs.readFileSync(path.join(raizProjeto, 'public', arquivo), 'utf8'));
}

// Uma frase e suficiente para provar presenca e e imune a diferenca de quebra
// de linha entre os dois arquivos.
function primeiraFrase(paragrafo) {
  const normalizado = normalizar(paragrafo);
  const corte = normalizado.search(/[.:]\s/);
  return corte > 30 ? normalizado.slice(0, corte) : normalizado.slice(0, 80);
}

// A linha de data e a unica que muda de FORMA entre os dois: o app mostra
// "Ultima atualizacao: DD de mes de AAAA" e o HTML junta os dois idiomas
// num rodape so ("Ultima atualizacao / Last updated: ... - Month DD, YYYY").
// Comparar a frase inteira acusaria divergencia onde nao ha. O que importa
// mesmo e a DATA bater - uma politica publicada com data velha e um problema
// de verdade -, e isso o teste da data confere.
const ehLinhaDeData = (p) => /ltima atualiza|Last updated/i.test(p);

test('a politica do app e a publicada dizem a mesma coisa (PT)', () => {
  const html = textoDoHtml();
  for (const paragrafo of paragrafosDoJs('privacyPt').filter((p) => !ehLinhaDeData(p))) {
    const frase = primeiraFrase(paragrafo);
    assert.ok(
      html.includes(frase),
      `public/privacy.html nao tem este paragrafo que o app mostra:\n  "${frase}..."`
    );
  }
});

test('a politica do app e a publicada dizem a mesma coisa (EN)', () => {
  const html = textoDoHtml();
  for (const paragrafo of paragrafosDoJs('privacyEn').filter((p) => !ehLinhaDeData(p))) {
    const frase = primeiraFrase(paragrafo);
    assert.ok(
      html.includes(frase),
      `public/privacy.html nao tem este paragrafo que o app mostra:\n  "${frase}..."`
    );
  }
});

test('os termos do app e os publicados dizem a mesma coisa (PT/EN)', () => {
  const html = textoDoHtml('terms.html');
  for (const chave of ['termsPt', 'termsEn']) {
    for (const paragrafo of paragrafosDoJs(chave).filter((p) => !ehLinhaDeData(p))) {
      const frase = primeiraFrase(paragrafo);
      assert.ok(
        html.includes(frase),
        `public/terms.html nao tem este paragrafo de ${chave}:\n  "${frase}..."`
      );
    }
  }
});

test('fotos e Anthropic nao sao chamados de efemeros', () => {
  const termos = [
    fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8'),
    fs.readFileSync(path.join(raizProjeto, 'public', 'terms.html'), 'utf8'),
  ].join('\n');

  assert.doesNotMatch(termos, /foto[^\n]{0,300}processamento ef[eê]mero/i);
  assert.doesNotMatch(termos, /photo[^\n]{0,300}ephemeral processing/i);
  assert.doesNotMatch(termos, /Anthropic[^\n]{0,160}(?:forma ef[eê]mera|ephemerally)/i);
  assert.match(termos, /seis meses/);
  assert.match(termos, /six months/);
  assert.match(termos, /retenção padrão de até 30 dias/);
  assert.match(termos, /standard retention of up to 30 days/);
});

test('device_id e descrito como pseudonimo, pois pode ser ligado ao email', () => {
  const textos = [
    fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8'),
    fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8'),
    fs.readFileSync(path.join(raizProjeto, 'public', 'account-deletion.html'), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(textos, /identificador an[oô]nimo|anonymous (?:device )?identifier/i);
  assert.match(textos, /identificador pseudonimizado/);
  assert.match(textos, /pseudonymous device identifier/);
});

test('o GBIF esta declarado nos dois lados', () => {
  // Especifico de proposito: o GBIF recebe o nome cientifico de TODO usuario,
  // com ou sem assinatura, e ficou meses sem aparecer em politica nenhuma.
  const html = fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8');
  const js = fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8');
  assert.match(html, /GBIF/, 'public/privacy.html nao menciona o GBIF');
  assert.match(js, /GBIF/, 'components/legalTexts.js nao menciona o GBIF');
});

test('a data de vigencia e a mesma nos dois', () => {
  const js = fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8');
  const html = normalizar(fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8'));

  // Pega a data em ingles do JS e exige a MESMA no HTML.
  // Se alguem revisar a politica e esquecer de republicar o HTML, o revisor da
  // Play Store le uma versao com data anterior a do app.
  const data = js.match(/([A-Z][a-z]+ \d{1,2}, \d{4})/);
  assert.ok(data, 'nao achei data de vigencia em legalTexts.js');
  assert.ok(
    html.includes(data[1]),
    `legalTexts.js diz "${data[1]}" e public/privacy.html nao tem essa data - republique o HTML`
  );
});

test('a data dos termos e a mesma no app e no HTML', () => {
  const js = fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8');
  const html = textoDoHtml('terms.html');
  const bloco = js.slice(js.indexOf('export const termsPt'));
  const data = bloco.match(/effective ([A-Z][a-z]+ \d{1,2}, \d{4})/);
  assert.ok(data, 'nao achei data de vigencia dos termos em legalTexts.js');
  assert.ok(html.includes(data[1]), `public/terms.html nao tem a data ${data[1]}`);
});

test('a ficha Play declara ervas como referencia medica e traz o disclaimer exigido', () => {
  const safety = fs.readFileSync(path.join(raizProjeto, 'store-assets', 'data-safety.md'), 'utf8');
  const pt = fs.readFileSync(path.join(raizProjeto, 'store-assets', 'metadata', 'pt-BR', 'full-description.txt'), 'utf8');
  const en = fs.readFileSync(path.join(raizProjeto, 'store-assets', 'metadata', 'en-US', 'full-description.txt'), 'utf8');

  assert.match(safety, /Medical Reference and Education/);
  assert.match(pt, /não é um dispositivo médico e não diagnostica, trata, cura nem previne/i);
  assert.match(en, /is not a medical device and does not diagnose, treat, cure, or prevent/i);
  assert.match(en, /Consult a qualified healthcare professional/i);
});

test('politica descreve IP direto, RLS real e limpeza diaria sem prometer 24h', () => {
  const textos = [
    fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8'),
    fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8'),
  ].join('\n');

  assert.doesNotMatch(textos, /(?:Wikipédia|Wikipedia|GBIF)[^\n]{0,240}(?:não quem você é|not who you are)/i);
  assert.match(textos, /GBIF[^\n]{0,300}(?:endereço IP|IP address)/i);
  assert.doesNotMatch(textos, /cada usuário só consegue acessar|each user can only access/i);
  assert.match(textos, /service_role/);
  assert.doesNotMatch(textos, /(?:apagados automaticamente em até|deleted within) 24 (?:horas|hours)/i);
  assert.match(textos, /(?:limpeza diária|daily cleanup)/i);
});

test('perfil agronomico e diario sao locais, completos e sem transmissao', () => {
  const fontes = [
    ['components/legalTexts.js', fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8')],
    ['public/privacy.html', fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8')],
  ];

  for (const [nome, texto] of fontes) {
    assert.match(texto, /Perfil agronômico e diário local/, `${nome} omite o nome do recurso em PT`);
    assert.match(texto, /País, subdivisão administrativa e localidade informados manualmente/, `${nome} omite a localização agronômica mundial manual`);
    assert.match(texto, /finalidade, sistema, data de plantio, estádio confirmado/i, `${nome} omite contexto de cultivo`);
    assert.match(texto, /descrição do solo e indicador de existência de laudo/i, `${nome} omite descrição e indicador de laudo`);
    assert.match(texto, /eventos, valores e notas/i, `${nome} omite o conteúdo do diário`);
    assert.match(texto, /armazenado somente no aparelho, não sincronizado nem enviado/i, `${nome} não declara armazenamento local em PT`);
    assert.match(texto, /limpa os dados do app, exclui a conta dentro do app ou desinstala/i, `${nome} omite os gatilhos de remoção em PT`);
    assert.match(texto, /perdidos sem backup/i, `${nome} omite o risco de perda sem backup em PT`);

    assert.match(texto, /Local agronomic profile and journal/, `${nome} omite o nome do recurso em EN`);
    assert.match(texto, /Country, administrative subdivision and locality entered manually/, `${nome} omite a localização agronômica mundial manual em EN`);
    assert.match(texto, /purpose, system, planting date, confirmed stage/i, `${nome} omite contexto de cultivo em EN`);
    assert.match(texto, /soil description and indicator of whether a soil report exists/i, `${nome} omite descrição e indicador de laudo em EN`);
    assert.match(texto, /events, values and notes/i, `${nome} omite o conteúdo do diário em EN`);
    assert.match(texto, /stored only on the device, not synced or sent/i, `${nome} não declara armazenamento local em EN`);
    assert.match(texto, /clear the app's data, delete your account in the app, or uninstall/i, `${nome} omite os gatilhos de remoção em EN`);
    assert.match(texto, /lost without a backup/i, `${nome} omite o risco de perda sem backup em EN`);

    assert.doesNotMatch(texto, /\bGPS\b|armazenad[oa]s? na nuvem|cloud storage/i, `${nome} atribui localização ou armazenamento não usados ao recurso`);
  }
});

test('espaco de observacao e diario sao locais e apagaveis', () => {
  const fontes = [
    ['components/legalTexts.js', fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8')],
    ['public/privacy.html', fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8')],
  ];

  for (const [nome, texto] of fontes) {
    assert.match(texto, /Espaço de observação e diário local/, `${nome} omite o recurso em PT`);
    assert.match(texto, /contexto escolhido, nome manual do local e nota de referência/i, `${nome} omite o perfil em PT`);
    assert.match(texto, /tipos de evento, datas, contagens, medidas, unidades e notas/i, `${nome} omite o diário em PT`);
    assert.match(texto, /Local observation workspace and journal/, `${nome} omite o recurso em EN`);
    assert.match(texto, /selected context, manually entered place name and baseline note/i, `${nome} omite o perfil em EN`);
    assert.match(texto, /event types, dates, counts, measurements, units and notes/i, `${nome} omite o diário em EN`);
    assert.match(texto, /não entram na sincronização da coleção e não são enviados/i, `${nome} promete transmissão em PT`);
    assert.match(texto, /not included in collection sync and are not sent/i, `${nome} promete transmissão em EN`);
    assert.match(texto, /podem ser perdidos sem backup/i, `${nome} omite perda local em PT`);
    assert.match(texto, /may be lost without a backup/i, `${nome} omite perda local em EN`);
  }
});

test('lembretes Android sao locais, opcionais e nao usam push remoto', () => {
  const fontes = [
    ['components/legalTexts.js', fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8')],
    ['public/privacy.html', fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8')],
  ];
  const safety = fs.readFileSync(path.join(raizProjeto, 'store-assets', 'data-safety.md'), 'utf8');

  for (const [nome, texto] of fontes) {
    assert.match(texto, /Lembretes locais do Android/, `${nome} omite o recurso em PT`);
    assert.match(texto, /tarefa, data, horário, repetição e o identificador local do exemplar/i, `${nome} omite os dados locais em PT`);
    assert.match(texto, /não cria token de push, não usa FCM nem Expo Push/i, `${nome} promete push remoto em PT`);
    assert.match(texto, /Local Android reminders/, `${nome} omite o recurso em EN`);
    assert.match(texto, /task, date, time, repeat rule and the specimen's local identifier/i, `${nome} omite os dados locais em EN`);
    assert.match(texto, /creates no push token, uses neither FCM nor Expo Push/i, `${nome} promete push remoto em EN`);
  }

  assert.match(safety, /agendados pelo próprio Android/i);
  assert.match(safety, /não usa FCM, Google Firebase nem Expo Push/i);
  assert.match(safety, /POST_NOTIFICATIONS/);
  assert.match(safety, /Alarmes exatos permanecem bloqueados/i);
});

test('som web, Android e iOS descreve limpeza local, fluxo Vercel-Perch e limites reais', () => {
  const politicas = [
    ['components/legalTexts.js', fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8')],
    ['public/privacy.html', fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8')],
  ];
  const termos = [
    ['components/legalTexts.js', politicas[0][1]],
    ['public/terms.html', fs.readFileSync(path.join(raizProjeto, 'public', 'terms.html'), 'utf8')],
  ];

  for (const [nome, texto] of politicas) {
    assert.match(texto, /web, no Android e no iOS/i, `${nome} omite as plataformas com som em PT`);
    assert.match(texto, /web, Android, and iOS/i, `${nome} omite as plataformas com som em EN`);
    assert.doesNotMatch(texto, /(?:n[aã]o (?:est[aá] dispon[ií]vel|existe) no iOS|not available on iOS|but not on iOS|unavailable on iOS)/i, `${nome} ainda chama o som de indisponivel no iOS`);
    assert.match(texto, /RECORD_AUDIO[^\n]{0,180}(?:primeiro toque|first tap)/i, `${nome} omite o momento da permissao`);
    assert.match(texto, /iOS[^\n]{0,100}(?:permiss[aã]o de microfone do sistema|system microphone permission)[^\n]{0,100}(?:primeiro toque|first tap)/i, `${nome} omite a permissao contextual do iOS`);
    assert.match(texto, /(?:converte WAV\/PCM localmente|converts WAV\/PCM locally)/i, `${nome} omite a conversao local`);
    assert.match(texto, /WAV[^\n]{0,220}(?:apag(?:a|ado)|deletes?)[^\n]{0,140}(?:antes (?:de|do) (?:qualquer )?upload|before (?:any )?upload)/i, `${nome} erra o momento da limpeza local`);
    assert.match(texto, /(?:função Vercel|Vercel function)[^\n]{0,300}(?:host Perch|Perch host)/i, `${nome} omite o fluxo Vercel-Perch`);
    assert.match(texto, /(?:requisição HTTPS autenticada|authenticated HTTPS request)/i, `${nome} omite a autenticacao do hop Perch`);
    assert.match(texto, /(?:sem venda nem uso independente|no sale or independent use)/i, `${nome} omite o limite dos operadores`);
    assert.match(texto, /logs[^\n]{0,120}APM[^\n]{0,120}log drains/i, `${nome} inventa garantia sem ressalva operacional`);
    assert.match(texto, /(?:áudio não entra na coleção|audio never enters the collection)/i, `${nome} promete salvar audio`);
    assert.match(texto, /(?:somente com o app em primeiro plano|only while the app is in the foreground)/i, `${nome} omite o limite ao primeiro plano`);
    assert.match(texto, /(?:não grava em segundo plano|does not record in the background)/i, `${nome} omite a ausencia de gravacao em background`);
    assert.match(texto, /(?:chamadas, estado do telefone ou Bluetooth|calls, phone state, or Bluetooth)/i, `${nome} omite limites de permissao`);
    assert.doesNotMatch(texto, /(?:não vai a nenhum terceiro|never reaches a third party|nosso próprio servidor|our own server)/i, `${nome} esconde os operadores de infraestrutura`);
  }

  for (const [nome, texto] of termos) {
    assert.doesNotMatch(texto, /(?:sons? \(somente na versão web\)|sound identification \(web version only\))/i, `${nome} ainda chama o som de web-only`);
    assert.match(texto, /(?:web, Android e iOS|web, Android, and iOS)/i, `${nome} omite som no iOS`);
    assert.doesNotMatch(texto, /(?:n[aã]o (?:est[aá] dispon[ií]vel|existe) no iOS|not available on iOS|but not on iOS|unavailable on iOS)/i, `${nome} ainda chama o som de indisponivel no iOS`);
    assert.match(texto, /iOS[^\n]{0,100}(?:permiss[aã]o de microfone do sistema|system microphone permission)[^\n]{0,100}(?:primeiro toque|first tap)/i, `${nome} omite a permissao contextual do iOS`);
    assert.match(texto, /(?:apenas com o app em primeiro plano|only while the app is in the foreground)/i, `${nome} omite o limite ao primeiro plano`);
    assert.match(texto, /WAV[^\n]{0,220}(?:apagado|deleted)[^\n]{0,140}(?:antes (?:de|do) (?:qualquer )?upload|before (?:any )?upload)/i, `${nome} erra o momento da limpeza local`);
    assert.match(texto, /(?:função Vercel|Vercel function)[^\n]{0,300}(?:host Perch|Perch host)/i, `${nome} omite o fluxo Vercel-Perch`);
    assert.match(texto, /(?:com autenticação|with authentication)/i, `${nome} omite a autenticacao do hop Perch`);
    assert.match(texto, /(?:sem venda nem uso independente|no sale or independent use)/i, `${nome} omite o limite dos operadores`);
    assert.match(texto, /(?:não entra na coleção|never enters the collection)/i, `${nome} promete salvar audio`);
    assert.match(texto, /(?:logs e APM|logs and APM)/i, `${nome} omite a ressalva operacional`);
    assert.doesNotMatch(texto, /(?:arquivo temporário nativo é apagado depois da resposta|native temporary file is deleted after the response)/i, `${nome} ainda descreve a ordem local errada`);
  }
});

test('ficha Data Safety declara audio e condiciona as excecoes aos operadores reais', () => {
  const safety = fs.readFileSync(path.join(raizProjeto, 'store-assets', 'data-safety.md'), 'utf8');
  const linha = safety.split(/\r?\n/).find((item) => item.includes('Arquivos de áudio > Gravações de voz ou som'));

  assert.ok(linha, 'tipo de audio ausente do formulario');
  assert.match(linha, /\| \*\*Sim\*\* \| Não \| \*\*Sim\*\*;/, 'audio deve ser coletado, nao compartilhado e opcional');
  assert.match(linha, /\| \*\*Sim\*\* \| Funcionalidade do app \|$/, 'audio deve ser efemero e servir apenas a funcionalidade');
  assert.doesNotMatch(safety, /Não marcar[^\n]{0,80}\báudio\b/i, 'audio nativo nao pode continuar excluido da ficha');
  assert.match(safety, /RECORD_AUDIO[^\n]{0,180}primeira vez/i);
  assert.match(safety, /prestador de serviço[^\n]{0,180}Vercel[^\n]{0,180}host Perch/i);
  assert.match(safety, /função Vercel[^\n]{0,240}requisição autenticada[^\n]{0,180}host Perch/i);
  assert.match(safety, /sem venda nem uso independente/i);
  assert.match(safety, /logs de acesso ou aplicação, APM, log drains, backups ou subprocessadores/i);
  assert.match(safety, /sem permissões de telefone, Bluetooth ou áudio em segundo plano/i);
});

test('checklist iOS bloqueia declaracao efemera sem prova de logs e APM', () => {
  const checklist = fs.readFileSync(
    path.join(raizProjeto, 'store-assets', 'app-store-checklist.md'),
    'utf8'
  );
  assert.match(checklist, /não copiar mecanicamente `data-safety\.md`/i);
  assert.match(checklist, /antes de deixar\s+`User Content > Audio Data`\s+desmarcado[\s\S]{0,100}efêmero à Apple/i);
  assert.match(checklist, /logs de acesso ou aplicação, APM, log drains, backups ou subprocessadores/i);
  assert.match(checklist, /se qualquer camada não puder ser validada, bloquear a declaração de\s+efemeridade/i);
  assert.match(checklist, /sem essa prova, não declarar o áudio efêmero ou não coletado à Apple/i);
});

test('rota mundial de aves divulga BioCLIP efemero e fallback Nyckel antes de ativar', () => {
  const policies = [
    fs.readFileSync(path.join(raizProjeto, 'components', 'legalTexts.js'), 'utf8'),
    fs.readFileSync(path.join(raizProjeto, 'public', 'privacy.html'), 'utf8'),
  ];
  for (const policy of policies) {
    assert.match(policy, /BioCLIP/i);
    assert.match(policy, /(?:apenas na memória|only in memory)/i);
    assert.match(policy, /(?:não (?:é |fica )?retid|(?:not|nor) retained)/i);
    assert.match(policy, /Nyckel/i);
    assert.match(policy, /(?:falhar|fails)[\s\S]{0,180}Nyckel/i);
  }

  const safety = fs.readFileSync(path.join(raizProjeto, 'store-assets', 'data-safety.md'), 'utf8');
  assert.match(safety, /BioCLIP/);
  assert.match(safety, /Compartilhado = Sim/);
  assert.match(safety, /Efêmero = Não/);
  assert.match(safety, /provedor de infraestrutura/i);
});
