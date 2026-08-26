const fs = require('node:fs');
const path = require('node:path');

const english = {
  petGuardian: {
    kicker: 'HOME SAFETY', title: 'Pet Guardian',
    severity: { emergency: 'Urgent risk', warning: 'Caution', safe: 'Documented safe', unknown: 'Not confirmed' },
    exactBody: 'This result has pet-specific evidence for the exact taxon shown.',
    generalWarningBody: 'The result contains a toxicity warning, but dog and cat safety was not confirmed separately.',
    unknownBody: 'No reliable pet-specific record was found for this exact taxon.',
    animals: { dog: 'Dogs', cat: 'Cats' }, status: { toxic: 'Toxic', safe: 'Non-toxic', unknown: 'Not confirmed' },
    toxicParts: 'Parts of concern', parts: { all: 'All plant parts', foliage: 'Leaves and plant tissue' },
    signsTitle: 'Possible warning signs',
    signs: { oral: 'Mouth irritation', gastro: 'Vomiting or diarrhea', lethargy: 'Lethargy', liver: 'Liver injury', bleeding: 'Bleeding', cardiac: 'Abnormal heart rhythm', kidney: 'Kidney injury' },
    contactAction: 'My pet may have touched or eaten it',
    sourceExact: 'Exact taxon checked against {{source}}.', sourceMissing: 'Pet safety remains unverified.', openSource: 'View source',
    emergencyTitle: 'Contact a veterinarian now',
    emergencyBody: 'Do not wait for symptoms and do not induce vomiting. Remove access to the plant, keep a sample or photo, and contact a local veterinarian or animal poison service immediately. The app does not replace veterinary assessment.',
    profile: { title: 'Animals in my home', body: 'Personalize plant safety warnings for the animals that live with you.', both: 'Dogs and cats', none: 'No animals selected' },
  },
  identityReview: {
    kicker: 'YOUR CONFIRMATION', title: 'Does this result match?', body: 'Confirm the first result or review the alternatives without losing the original guess.',
    confirmedTitle: 'Result confirmed by you', confirmedBody: 'The original result and your confirmation are saved together.',
    correctedTitle: 'Alternative saved', correctedBody: 'You selected {{name}}. Take another photo before relying on species-specific care or safety.',
    yesAction: 'Yes, it matches', changeAction: 'Review choices', retakeAction: 'Take a validation photo',
    sheetTitle: 'What did you observe?', sheetBody: 'Your choice never erases the model’s original answer.', noAlternatives: 'No other reliable candidate was returned for this capture.',
  },
  checkIn: {
    kicker: 'NATURE PASSPORT', title: 'Add a city check-in', body: 'Remember where you found it without saving an exact coordinate.',
    savedBody: 'Observed in {{habitat}}. Only city-level location is stored.', addAction: 'Add check-in', editAction: 'Edit', communityAction: 'Share experience',
    sheetTitle: 'Record this encounter', privacyBody: 'NatureLens stores city, country and habitat. It does not store the exact coordinate.',
    suggestAction: 'Suggest city from approximate location', locating: 'Finding city…', city: 'City', country: 'Country', habitat: 'Habitat', note: 'Field note', noteHint: 'What did you notice?',
    habitats: { home: 'Home', garden: 'Garden', trail: 'Trail', farm: 'Farm or crop', water: 'Water', urban: 'Urban area', other: 'Other' },
    communityDraft: 'I observed {{name}} in {{city}}, {{country}}, in {{habitat}}. I saved this encounter in my NatureLens passport.',
  },
};

const portuguese = {
  petGuardian: {
    kicker: 'SEGURANÇA EM CASA', title: 'Guardião Pet',
    severity: { emergency: 'Risco urgente', warning: 'Atenção', safe: 'Segurança documentada', unknown: 'Não confirmado' },
    exactBody: 'Este resultado possui evidência específica para pets ligada exatamente ao táxon exibido.',
    generalWarningBody: 'O resultado contém alerta de toxicidade, mas a segurança para cães e gatos não foi confirmada separadamente.',
    unknownBody: 'Não encontramos registro confiável e específico para pets neste táxon exato.',
    animals: { dog: 'Cães', cat: 'Gatos' }, status: { toxic: 'Tóxica', safe: 'Não tóxica', unknown: 'Não confirmado' },
    toxicParts: 'Partes preocupantes', parts: { all: 'Toda a planta', foliage: 'Folhas e tecidos da planta' },
    signsTitle: 'Possíveis sinais de alerta',
    signs: { oral: 'Irritação na boca', gastro: 'Vômito ou diarreia', lethargy: 'Letargia', liver: 'Lesão no fígado', bleeding: 'Sangramento', cardiac: 'Ritmo cardíaco anormal', kidney: 'Lesão nos rins' },
    contactAction: 'Meu pet pode ter tocado ou ingerido',
    sourceExact: 'Táxon exato conferido com {{source}}.', sourceMissing: 'A segurança para pets continua não verificada.', openSource: 'Ver fonte',
    emergencyTitle: 'Procure um veterinário agora',
    emergencyBody: 'Não espere surgirem sintomas e não provoque vômito. Afaste o animal da planta, guarde uma amostra ou foto e procure imediatamente um veterinário ou serviço de toxicologia animal da sua região. O aplicativo não substitui avaliação veterinária.',
    profile: { title: 'Animais da minha casa', body: 'Personalize os alertas de segurança das plantas para os animais que vivem com você.', both: 'Cães e gatos', none: 'Nenhum animal selecionado' },
  },
  identityReview: {
    kicker: 'SUA CONFIRMAÇÃO', title: 'Este resultado confere?', body: 'Confirme o primeiro resultado ou veja as alternativas sem apagar o palpite original.',
    confirmedTitle: 'Resultado confirmado por você', confirmedBody: 'O resultado original e sua confirmação foram salvos juntos.',
    correctedTitle: 'Alternativa salva', correctedBody: 'Você escolheu {{name}}. Tire outra foto antes de confiar em cuidados ou segurança específicos da espécie.',
    yesAction: 'Sim, confere', changeAction: 'Ver opções', retakeAction: 'Tirar foto de validação',
    sheetTitle: 'O que você observou?', sheetBody: 'Sua escolha nunca apaga a resposta original do modelo.', noAlternatives: 'Nenhum outro candidato confiável foi retornado nesta captura.',
  },
  checkIn: {
    kicker: 'PASSAPORTE DA NATUREZA', title: 'Adicionar check-in da cidade', body: 'Lembre onde encontrou sem guardar uma coordenada exata.',
    savedBody: 'Observado em {{habitat}}. Apenas a localização em nível de cidade é guardada.', addAction: 'Adicionar check-in', editAction: 'Editar', communityAction: 'Compartilhar experiência',
    sheetTitle: 'Registrar este encontro', privacyBody: 'O NatureLens guarda cidade, país e habitat. A coordenada exata não é armazenada.',
    suggestAction: 'Sugerir cidade pela localização aproximada', locating: 'Buscando cidade…', city: 'Cidade', country: 'País', habitat: 'Habitat', note: 'Nota de campo', noteHint: 'O que você percebeu?',
    habitats: { home: 'Casa', garden: 'Jardim', trail: 'Trilha', farm: 'Campo ou lavoura', water: 'Água', urban: 'Área urbana', other: 'Outro' },
    communityDraft: 'Observei {{name}} em {{city}}, {{country}}, no ambiente {{habitat}}. Salvei este encontro no meu passaporte NatureLens.',
  },
};

const targets = {
  es: 'es', de: 'de', fr: 'fr', it: 'it', nl: 'nl', pl: 'pl', sv: 'sv', da: 'da', cs: 'cs', tr: 'tr', ko: 'ko', zh: 'zh-CN', 'zh-hant': 'zh-TW', hi: 'hi', ar: 'ar',
};

function flatten(value, prefix = '', output = []) {
  for (const [key, item] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'string') output.push([next, item]);
    else flatten(item, next, output);
  }
  return output;
}

function inflate(entries) {
  const root = {};
  for (const [pathKey, value] of entries) {
    const parts = pathKey.split('.'); let target = root;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) target[part] = value;
      else target = target[part] ||= {};
    });
  }
  return root;
}

function protect(text) {
  return text.replace(/\{\{([a-zA-Z]+)\}\}/g, '__NLVAR_$1__');
}

function restore(text) {
  return text.replace(/__NLVAR_([a-zA-Z]+)__/g, '{{$1}}');
}

async function translateLocale(target) {
  const entries = flatten(english);
  const marker = '\n';
  const values = [];
  for (let start = 0; start < entries.length; start += 8) {
    const batch = entries.slice(start, start + 8);
    const source = batch.map(([, value]) => protect(value)).join(marker);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(source)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`translation ${target}: ${response.status}`);
    const payload = await response.json();
    const translated = payload[0].map((part) => part[0]).join('');
    const translatedBatch = translated.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (translatedBatch.length !== batch.length) throw new Error(`translation ${target}: expected batch ${batch.length}, got ${translatedBatch.length}`);
    values.push(...translatedBatch);
  }
  return inflate(entries.map(([key], index) => [key, restore(values[index].trim())]));
}

function appendFeatures(locale, features) {
  const file = path.join(__dirname, '..', 'public', 'locales', `${locale}.json`);
  let source = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(source);
  if (parsed.petGuardian && parsed.identityReview && parsed.checkIn) return;
  if (parsed.petGuardian || parsed.identityReview || parsed.checkIn) throw new Error(`partial features: ${locale}`);
  const end = source.lastIndexOf('}');
  const blocks = Object.entries(features).map(([key, value]) => {
    const body = JSON.stringify(value, null, 2).split('\n').map((line, index) => index ? `  ${line}` : line).join('\n');
    return `  ${JSON.stringify(key)}: ${body}`;
  }).join(',\n');
  source = `${source.slice(0, end).trimEnd()},\n${blocks}\n${source.slice(end)}`;
  JSON.parse(source);
  fs.writeFileSync(file, source, 'utf8');
}

(async () => {
  appendFeatures('en', english);
  appendFeatures('pt', portuguese);
  for (const [locale, target] of Object.entries(targets)) {
    appendFeatures(locale, await translateLocale(target));
    process.stdout.write(`${locale} `);
  }
  process.stdout.write('\n');
})().catch((error) => { console.error(error); process.exitCode = 1; });
