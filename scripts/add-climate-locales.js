const fs = require('node:fs');
const path = require('node:path');

const copy = {
  en: ['LOCAL CLIMATE', 'Climate rhythm at this location', 'See monthly climatology before comparing field observations. This describes climate; it is not an irrigation or fertilizer prescription.', 'Rain', 'Mean temperature', '{{value}} mm', '{{value}} °C', 'Only a {{precision}}° approximate grid is sent and cached. Your exact position is not stored.', 'Open official NASA POWER source', 'Location was not shared. You can enable it in the device settings and try again.', 'Climate data is temporarily unavailable.', 'Use approximate location'],
  pt: ['CLIMA LOCAL', 'Ritmo climático deste local', 'Veja a climatologia mensal antes de comparar observações de campo. Isto descreve o clima; não é receita de irrigação ou adubação.', 'Chuva', 'Temperatura média', '{{value}} mm', '{{value}} °C', 'Apenas uma grade aproximada de {{precision}}° é enviada e guardada. Sua posição exata não é armazenada.', 'Abrir fonte oficial NASA POWER', 'A localização não foi compartilhada. Você pode ativá-la nos ajustes do aparelho e tentar novamente.', 'Os dados climáticos estão temporariamente indisponíveis.', 'Usar localização aproximada'],
  es: ['CLIMA LOCAL', 'Ritmo climático de este lugar', 'Consulta la climatología mensual antes de comparar observaciones de campo. Describe el clima; no es una receta de riego ni fertilización.', 'Lluvia', 'Temperatura media', '{{value}} mm', '{{value}} °C', 'Solo se envía y guarda una cuadrícula aproximada de {{precision}}°. Tu posición exacta no se almacena.', 'Abrir fuente oficial NASA POWER', 'No se compartió la ubicación. Puedes activarla en los ajustes del dispositivo e intentarlo de nuevo.', 'Los datos climáticos no están disponibles temporalmente.', 'Usar ubicación aproximada'],
  de: ['LOKALES KLIMA', 'Klimaverlauf an diesem Ort', 'Prüfe die monatliche Klimatologie, bevor du Feldbeobachtungen vergleichst. Sie beschreibt das Klima und ist keine Bewässerungs- oder Düngeempfehlung.', 'Niederschlag', 'Mittlere Temperatur', '{{value}} mm', '{{value}} °C', 'Nur ein ungefähres {{precision}}°-Raster wird gesendet und gespeichert. Dein genauer Standort wird nicht gespeichert.', 'Offizielle NASA-POWER-Quelle öffnen', 'Der Standort wurde nicht geteilt. Aktiviere ihn in den Geräteeinstellungen und versuche es erneut.', 'Klimadaten sind vorübergehend nicht verfügbar.', 'Ungefähren Standort verwenden'],
  fr: ['CLIMAT LOCAL', 'Rythme climatique de ce lieu', 'Consultez la climatologie mensuelle avant de comparer les observations de terrain. Elle décrit le climat, sans prescrire irrigation ni fertilisation.', 'Pluie', 'Température moyenne', '{{value}} mm', '{{value}} °C', 'Seule une grille approximative de {{precision}}° est envoyée et mise en cache. Votre position exacte n’est pas stockée.', 'Ouvrir la source officielle NASA POWER', 'La position n’a pas été partagée. Activez-la dans les réglages de l’appareil puis réessayez.', 'Les données climatiques sont temporairement indisponibles.', 'Utiliser la position approximative'],
  it: ['CLIMA LOCALE', 'Ritmo climatico di questo luogo', 'Consulta la climatologia mensile prima di confrontare le osservazioni sul campo. Descrive il clima, non prescrive irrigazione o concimazione.', 'Pioggia', 'Temperatura media', '{{value}} mm', '{{value}} °C', 'Viene inviata e memorizzata solo una griglia approssimativa di {{precision}}°. La posizione esatta non viene salvata.', 'Apri la fonte ufficiale NASA POWER', 'La posizione non è stata condivisa. Attivala nelle impostazioni del dispositivo e riprova.', 'I dati climatici non sono temporaneamente disponibili.', 'Usa posizione approssimativa'],
  nl: ['LOKAAL KLIMAAT', 'Klimaatritme op deze locatie', 'Bekijk de maandelijkse klimatologie voordat je veldwaarnemingen vergelijkt. Dit beschrijft het klimaat en is geen irrigatie- of bemestingsadvies.', 'Regen', 'Gemiddelde temperatuur', '{{value}} mm', '{{value}} °C', 'Alleen een globaal raster van {{precision}}° wordt verzonden en bewaard. Je exacte locatie wordt niet opgeslagen.', 'Officiële NASA POWER-bron openen', 'Locatie is niet gedeeld. Schakel die in bij de apparaatinstellingen en probeer opnieuw.', 'Klimaatgegevens zijn tijdelijk niet beschikbaar.', 'Globale locatie gebruiken'],
  pl: ['KLIMAT LOKALNY', 'Rytm klimatu w tej lokalizacji', 'Sprawdź miesięczną klimatologię przed porównaniem obserwacji terenowych. Opisuje klimat, ale nie zaleca nawadniania ani nawożenia.', 'Opad', 'Średnia temperatura', '{{value}} mm', '{{value}} °C', 'Wysyłana i zapisywana jest tylko przybliżona siatka {{precision}}°. Dokładna pozycja nie jest przechowywana.', 'Otwórz oficjalne źródło NASA POWER', 'Lokalizacja nie została udostępniona. Włącz ją w ustawieniach urządzenia i spróbuj ponownie.', 'Dane klimatyczne są chwilowo niedostępne.', 'Użyj przybliżonej lokalizacji'],
  sv: ['LOKALT KLIMAT', 'Klimatets rytm på platsen', 'Se månatlig klimatologi innan du jämför fältobservationer. Den beskriver klimatet och är ingen bevattnings- eller gödslingsrekommendation.', 'Regn', 'Medeltemperatur', '{{value}} mm', '{{value}} °C', 'Endast ett ungefärligt rutnät på {{precision}}° skickas och sparas. Din exakta position lagras inte.', 'Öppna officiell NASA POWER-källa', 'Platsen delades inte. Aktivera den i enhetens inställningar och försök igen.', 'Klimatdata är tillfälligt otillgängliga.', 'Använd ungefärlig plats'],
  da: ['LOKALT KLIMA', 'Klimaets rytme på stedet', 'Se den månedlige klimatologi, før du sammenligner feltobservationer. Den beskriver klimaet og er ikke en vandings- eller gødningsanbefaling.', 'Regn', 'Middeltemperatur', '{{value}} mm', '{{value}} °C', 'Kun et omtrentligt gitter på {{precision}}° sendes og gemmes. Din præcise placering lagres ikke.', 'Åbn officiel NASA POWER-kilde', 'Placeringen blev ikke delt. Aktivér den i enhedens indstillinger, og prøv igen.', 'Klimadata er midlertidigt utilgængelige.', 'Brug omtrentlig placering'],
  cs: ['MÍSTNÍ KLIMA', 'Klimatický rytmus tohoto místa', 'Před porovnáním terénních pozorování si prohlédněte měsíční klimatologii. Popisuje klima, ale neurčuje zavlažování ani hnojení.', 'Srážky', 'Průměrná teplota', '{{value}} mm', '{{value}} °C', 'Odesílá a ukládá se pouze přibližná mřížka {{precision}}°. Přesná poloha se neukládá.', 'Otevřít oficiální zdroj NASA POWER', 'Poloha nebyla sdílena. Povolte ji v nastavení zařízení a zkuste to znovu.', 'Klimatická data jsou dočasně nedostupná.', 'Použít přibližnou polohu'],
  tr: ['YEREL İKLİM', 'Bu konumun iklim ritmi', 'Saha gözlemlerini karşılaştırmadan önce aylık klimatolojiyi görün. Bu iklimi tanımlar; sulama veya gübreleme reçetesi değildir.', 'Yağış', 'Ortalama sıcaklık', '{{value}} mm', '{{value}} °C', 'Yalnızca yaklaşık {{precision}}° ızgara gönderilir ve önbelleğe alınır. Kesin konumunuz saklanmaz.', 'Resmî NASA POWER kaynağını aç', 'Konum paylaşılmadı. Cihaz ayarlarından etkinleştirip yeniden deneyebilirsiniz.', 'İklim verileri geçici olarak kullanılamıyor.', 'Yaklaşık konumu kullan'],
  ko: ['지역 기후', '이 위치의 기후 흐름', '현장 관찰을 비교하기 전에 월별 기후 자료를 확인하세요. 기후 설명이며 관개나 비료 처방이 아닙니다.', '강수량', '평균 기온', '{{value}} mm', '{{value}} °C', '약 {{precision}}° 격자만 전송하고 저장합니다. 정확한 위치는 저장하지 않습니다.', 'NASA POWER 공식 출처 열기', '위치가 공유되지 않았습니다. 기기 설정에서 허용한 뒤 다시 시도하세요.', '기후 데이터를 일시적으로 사용할 수 없습니다.', '대략적인 위치 사용'],
  zh: ['当地气候', '此地的气候节律', '比较野外观察之前，先查看逐月气候资料。这只是气候描述，并非灌溉或施肥处方。', '降雨', '平均气温', '{{value}} 毫米', '{{value}} °C', '仅发送并缓存约 {{precision}}° 的网格，不会保存你的精确位置。', '打开 NASA POWER 官方来源', '未共享位置。你可以在设备设置中启用后重试。', '气候数据暂时不可用。', '使用大致位置'],
  'zh-hant': ['當地氣候', '此地的氣候節律', '比較田野觀察之前，先查看每月氣候資料。這只是氣候描述，並非灌溉或施肥處方。', '降雨', '平均氣溫', '{{value}} 毫米', '{{value}} °C', '僅傳送並快取約 {{precision}}° 的網格，不會儲存你的精確位置。', '開啟 NASA POWER 官方來源', '未分享位置。你可以在裝置設定中啟用後重試。', '氣候資料暫時無法使用。', '使用大致位置'],
  hi: ['स्थानीय जलवायु', 'इस स्थान की जलवायु लय', 'मैदानी अवलोकनों की तुलना से पहले मासिक जलवायु देखें। यह जलवायु का वर्णन है, सिंचाई या उर्वरक का निर्देश नहीं।', 'वर्षा', 'औसत तापमान', '{{value}} मिमी', '{{value}} °C', 'केवल लगभग {{precision}}° ग्रिड भेजा और सहेजा जाता है। आपकी सटीक स्थिति संग्रहीत नहीं होती।', 'NASA POWER का आधिकारिक स्रोत खोलें', 'स्थान साझा नहीं हुआ। डिवाइस सेटिंग में इसे चालू करके फिर प्रयास करें।', 'जलवायु डेटा अभी उपलब्ध नहीं है।', 'अनुमानित स्थान का उपयोग करें'],
  ar: ['المناخ المحلي', 'نمط المناخ في هذا الموقع', 'اطّلع على علم المناخ الشهري قبل مقارنة الملاحظات الميدانية. هذا وصف للمناخ وليس وصفة للري أو التسميد.', 'الأمطار', 'متوسط الحرارة', '{{value}} مم', '{{value}} °م', 'يتم إرسال وتخزين شبكة تقريبية بدرجة {{precision}}° فقط. لا يتم حفظ موقعك الدقيق.', 'فتح مصدر NASA POWER الرسمي', 'لم تتم مشاركة الموقع. يمكنك تفعيله من إعدادات الجهاز والمحاولة مجددًا.', 'بيانات المناخ غير متاحة مؤقتًا.', 'استخدام الموقع التقريبي'],
};

function objectEnd(source, start) {
  let depth = 0; let quoted = false; let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
    if (char === '"') quoted = true;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return index;
  }
  throw new Error('unterminated object');
}

const keys = ['kicker', 'title', 'body', 'rain', 'temperature', 'rainValue', 'temperatureValue', 'privacy', 'source', 'permission', 'error', 'action'];
for (const [locale, values] of Object.entries(copy)) {
  const file = path.join(__dirname, '..', 'public', 'locales', `${locale}.json`);
  let source = fs.readFileSync(file, 'utf8');
  const marker = '"agronomyWorkspace": {';
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`agronomyWorkspace missing in ${locale}`);
  const start = source.indexOf('{', markerIndex);
  const end = objectEnd(source, start);
  const current = JSON.parse(source.slice(start, end + 1));
  if (current.climate) continue;
  const object = Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  const block = JSON.stringify(object, null, 2).split('\n').map((line, index) => index === 0 ? line : `  ${line}`).join('\n');
  source = `${source.slice(0, end)},\n    "climate": ${block}${source.slice(end)}`;
  JSON.parse(source);
  fs.writeFileSync(file, source);
}
