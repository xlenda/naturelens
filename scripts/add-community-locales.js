const fs = require('node:fs');
const path = require('node:path');

const copy = {
  en: ['Online community', 'Field notes', 'Comment', 'Report and block', 'Delete post', 'Community unavailable'],
  pt: ['Comunidade online', 'Caderno de campo', 'Comentar', 'Denunciar e bloquear', 'Excluir publicação', 'Comunidade indisponível'],
  es: ['Comunidad en línea', 'Cuaderno de campo', 'Comentar', 'Denunciar y bloquear', 'Eliminar publicación', 'Comunidad no disponible'],
  de: ['Online-Community', 'Feldnotizen', 'Kommentieren', 'Melden und blockieren', 'Beitrag löschen', 'Community nicht verfügbar'],
  fr: ['Communauté en ligne', 'Carnet de terrain', 'Commenter', 'Signaler et bloquer', 'Supprimer la publication', 'Communauté indisponible'],
  it: ['Comunità online', 'Taccuino sul campo', 'Commenta', 'Segnala e blocca', 'Elimina post', 'Comunità non disponibile'],
  nl: ['Online community', 'Veldnotities', 'Reageren', 'Melden en blokkeren', 'Bericht verwijderen', 'Community niet beschikbaar'],
  pl: ['Społeczność online', 'Notatnik terenowy', 'Skomentuj', 'Zgłoś i zablokuj', 'Usuń wpis', 'Społeczność niedostępna'],
  sv: ['Onlinegemenskap', 'Fältanteckningar', 'Kommentera', 'Anmäl och blockera', 'Ta bort inlägg', 'Gemenskapen är inte tillgänglig'],
  da: ['Onlinefællesskab', 'Feltnoter', 'Kommenter', 'Anmeld og blokér', 'Slet opslag', 'Fællesskabet er ikke tilgængeligt'],
  cs: ['Online komunita', 'Terénní zápisník', 'Komentovat', 'Nahlásit a zablokovat', 'Smazat příspěvek', 'Komunita není dostupná'],
  tr: ['Çevrimiçi topluluk', 'Saha notları', 'Yorum yap', 'Bildir ve engelle', 'Gönderiyi sil', 'Topluluk kullanılamıyor'],
  ko: ['온라인 커뮤니티', '현장 기록', '댓글 달기', '신고 및 차단', '게시물 삭제', '커뮤니티를 사용할 수 없습니다'],
  zh: ['在线社区', '野外笔记', '评论', '举报并屏蔽', '删除帖子', '社区暂不可用'],
  'zh-hant': ['線上社群', '野外筆記', '留言', '檢舉並封鎖', '刪除貼文', '社群暫時無法使用'],
  hi: ['ऑनलाइन समुदाय', 'क्षेत्रीय टिप्पणियाँ', 'टिप्पणी करें', 'रिपोर्ट और ब्लॉक करें', 'पोस्ट हटाएँ', 'समुदाय उपलब्ध नहीं है'],
  ar: ['المجتمع عبر الإنترنت', 'ملاحظات ميدانية', 'تعليق', 'إبلاغ وحظر', 'حذف المنشور', 'المجتمع غير متاح'],
};

function objectEnd(source, start) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return index;
  }
  throw new Error('unterminated community object');
}

for (const [locale, values] of Object.entries(copy)) {
  const file = path.join(__dirname, '..', 'public', 'locales', `${locale}.json`);
  let source = fs.readFileSync(file, 'utf8');
  if (source.includes('"onlineBadge"')) continue;
  const marker = '"community": {';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`community missing in ${locale}`);
  const start = source.indexOf('{', markerIndex);
  const end = objectEnd(source, start);
  const keys = ['onlineBadge', 'feedTitle', 'commentAction', 'reportAndBlock', 'deletePost', 'unavailable'];
  const additions = keys.map((key, index) => `    ${JSON.stringify(key)}: ${JSON.stringify(values[index])}`).join(',\n');
  source = `${source.slice(0, end - 1)},\n${additions}\n  ${source.slice(end)}`;
  JSON.parse(source);
  fs.writeFileSync(file, source);
}
