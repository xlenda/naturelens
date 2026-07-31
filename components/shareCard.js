// Renders a shareable image card for an identification.
//
// Why an image and not text: a WhatsApp text share is a grey line of words
// nobody clicks. An image with the user's own photo, the species name and the
// app's mark is the single cheapest acquisition channel this app has - every
// share becomes a small ad, and in Brazil that channel is WhatsApp.
//
// Web only, by construction: this draws on a <canvas>, which does not exist in
// a native build. Callers must fall back to text sharing when this returns null
// (see components/share.js) - never let a missing card block the share itself.

const CARD_W = 1080;
const CARD_H = 1350; // 4:5 - the tallest ratio WhatsApp/Instagram show uncropped

// Palette copied from theme.js rather than imported: this module runs inside a
// canvas context with no React, and hardcoding avoids pulling the RN StyleSheet
// dependency chain into a plain drawing routine.
const BG = '#0E1512';
const ACCENT = '#4E9F6B';
const TEXT = '#F2F5F3';
const MUTED = '#B4C2BA';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Wraps text to a max width and returns the lines, so a long common name
// ("Great northern pickerel") cannot run off the edge of the card.
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  // Ellipsis on the final line if anything was dropped.
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    if (lines.join(' ').length < String(text).length) lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    // The user's own photo is a blob:/data: URI so this is a no-op for it, but
    // it matters if a remote reference photo is ever used as the card image:
    // without it the canvas becomes tainted and toBlob() throws.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Draws the card and resolves to a PNG Blob, or null if it cannot be produced
 * (not web, no canvas support, or a tainted canvas).
 *
 * `labels` carries already-translated strings so this module never needs i18n:
 *   { categoryLabel, confidenceLabel, tagline }
 */
export async function renderShareCard(entity, labels = {}) {
  if (typeof document === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // --- photo, cover-cropped into the top area ---
    const photoH = Math.round(CARD_H * 0.62);
    const img = await loadImage(entity.photoUri);
    if (img && img.width && img.height) {
      const scale = Math.max(CARD_W / img.width, photoH / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (CARD_W - dw) / 2, (photoH - dh) / 2, dw, dh);
    } else {
      // No photo (or it failed to load): a flat accent block still produces a
      // usable card rather than a broken one.
      ctx.fillStyle = '#16281D';
      ctx.fillRect(0, 0, CARD_W, photoH);
    }

    // Gradient so the text below always has contrast regardless of the photo.
    const grad = ctx.createLinearGradient(0, photoH - 260, 0, photoH);
    grad.addColorStop(0, 'rgba(14,21,18,0)');
    grad.addColorStop(1, BG);
    ctx.fillStyle = grad;
    ctx.fillRect(0, photoH - 260, CARD_W, 260);

    const PAD = 72;
    let y = photoH + 28;

    // --- category pill ---
    if (labels.categoryLabel) {
      ctx.font = '600 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      const pillW = ctx.measureText(labels.categoryLabel).width + 56;
      ctx.fillStyle = `${ACCENT}33`;
      roundRect(ctx, PAD, y, pillW, 62, 31);
      ctx.fill();
      ctx.fillStyle = ACCENT;
      ctx.textBaseline = 'middle';
      ctx.fillText(labels.categoryLabel, PAD + 28, y + 32);
      y += 96;
    }

    // --- common name ---
    ctx.fillStyle = TEXT;
    ctx.font = '800 82px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top';
    const nameLines = wrapLines(ctx, entity.name, CARD_W - PAD * 2, 2);
    for (const line of nameLines) {
      ctx.fillText(line, PAD, y);
      y += 94;
    }

    // --- scientific name ---
    if (entity.scientific && entity.scientific !== entity.name) {
      ctx.fillStyle = MUTED;
      ctx.font = 'italic 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      const sciLines = wrapLines(ctx, entity.scientific, CARD_W - PAD * 2, 1);
      ctx.fillText(sciLines[0], PAD, y + 6);
      y += 64;
    }

    // --- confidence ---
    if (entity.confidence != null && labels.confidenceLabel) {
      ctx.fillStyle = ACCENT;
      ctx.font = '700 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(`${entity.confidence}% · ${labels.confidenceLabel}`, PAD, y + 14);
    }

    // --- footer: brand + URL. This is the part that makes a share an ad. ---
    ctx.fillStyle = MUTED;
    ctx.font = '600 36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('NatureLens', PAD, CARD_H - 76);

    ctx.fillStyle = ACCENT;
    ctx.font = '600 36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const url = 'naturelensapp.cloud';
    const urlW = ctx.measureText(url).width;
    ctx.fillText(url, CARD_W - PAD - urlW, CARD_H - 76);

    return await toBlob(canvas);
  } catch (e) {
    return null;
  }
}

function toBlob(canvas) {
  return new Promise((resolve) => {
    // toBlob throws on a tainted canvas (a cross-origin photo without CORS
    // headers); resolving null lets the caller fall back to text.
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 0.92);
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Monthly recap card. Same 4:5 canvas, but a stats layout instead of a photo
 * hero - a recap is a scoreboard, and a scoreboard is what people screenshot.
 *
 * `labels` carries already-translated strings:
 *   { monthName, headline, stats: [{ value, label }], footer }
 */
export async function renderRecapCard(recap, labels = {}) {
  if (typeof document === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background, tinted by the user's most-used category so two people's
    // recaps of the same month don't look identical.
    const accent = recap.topCategoryAccent || ACCENT;
    const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bg.addColorStop(0, accent);
    bg.addColorStop(0.55, '#16281D');
    bg.addColorStop(1, BG);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    const PAD = 80;

    // --- month label ---
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '700 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(String(labels.monthName || '').toUpperCase(), PAD, 110);

    // --- headline ---
    ctx.fillStyle = TEXT;
    ctx.font = '800 76px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    let y = 178;
    for (const line of wrapLines(ctx, labels.headline, CARD_W - PAD * 2, 3)) {
      ctx.fillText(line, PAD, y);
      y += 88;
    }

    // --- stat tiles, 2x2 ---
    const stats = (labels.stats || []).slice(0, 4);
    const tileW = (CARD_W - PAD * 2 - 28) / 2;
    const tileH = 190;
    let ty = Math.max(y + 50, 520);
    stats.forEach((s, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = PAD + col * (tileW + 28);
      const yy = ty + row * (tileH + 24);

      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      roundRect(ctx, x, yy, tileW, tileH, 24);
      ctx.fill();

      ctx.fillStyle = TEXT;
      ctx.font = '800 72px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(String(s.value), x + 30, yy + 34);

      ctx.fillStyle = MUTED;
      ctx.font = '600 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      const label = wrapLines(ctx, s.label, tileW - 60, 2);
      let ly = yy + 122;
      for (const line of label) {
        ctx.fillText(line, x + 30, ly);
        ly += 34;
      }
    });

    // --- footer brand + URL ---
    ctx.fillStyle = MUTED;
    ctx.font = '600 36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('NatureLens', PAD, CARD_H - 76);

    ctx.fillStyle = ACCENT;
    const url = 'naturelensapp.cloud';
    const urlW = ctx.measureText(url).width;
    ctx.fillText(url, CARD_W - PAD - urlW, CARD_H - 76);

    return await toBlob(canvas);
  } catch (e) {
    return null;
  }
}
