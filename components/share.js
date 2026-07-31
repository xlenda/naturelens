import { Platform, Share } from 'react-native';
import { recordShare, addTokens } from './achievements';
import { recordMissionEvent, TOKENS_PER_MISSION } from './missions';
import { renderShareCard, renderRecapCard } from './shareCard';
import { trackResultShared } from './tracking';
import i18n from '../i18n';

const APP_URL = 'https://naturelensapp.cloud';

export async function shareEntity(entity, categoryLabel) {
  // The message used to be hardcoded English ("I identified a plant: ...") in
  // an app that ships 17 languages - every Brazilian user was sharing in a
  // language their contacts might not read. It also carried no link, so a
  // share brought nobody back. Both fixed here: translated copy plus the URL.
  const message = i18n.t('share.message', {
    category: String(categoryLabel || '').toLowerCase(),
    name: entity.name,
    scientific: entity.scientific ? `\n${entity.scientific}` : '',
    confidence: entity.confidence != null ? `\n${i18n.t('share.confidenceLine', { confidence: entity.confidence })}` : '',
    url: APP_URL,
  });

  // Counts the attempt (opening the share sheet/WhatsApp link), not a
  // confirmed completed share - neither Web Share nor RN's Share module
  // reliably reports whether the user actually finished sharing vs.
  // cancelled the native sheet, so this is a deliberate loose approximation
  // for the "shared at least once" achievement, not exact telemetry.
  recordShare();
  // Share mission credit - idempotent inside recordMissionEvent, so a second
  // share today advances nothing and pays nothing twice.
  recordMissionEvent('share').then((done) => {
    if (done.length) addTokens(done.length * TOKENS_PER_MISSION);
  });

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      // Try the image card first. A photo of the actual find, with the species
      // name and the app's URL burned in, is what makes a WhatsApp share worth
      // anything - a text line is invisible in a busy group chat.
      try {
        const blob = await renderShareCard(entity, {
          categoryLabel,
          confidenceLabel: i18n.t('common.confidence'),
        });
        if (blob) {
          const file = new File([blob], 'naturelens.png', { type: 'image/png' });
          // canShare({files}) must be checked separately: browsers that support
          // navigator.share do not all support sharing files, and calling
          // share() with an unsupported payload throws instead of degrading.
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text: message });
            trackResultShared({ category: entity.category, method: 'web_share_image' });
            return;
          }
        }
      } catch (e) {
        // Card generation or the file share failed (user cancelled, tainted
        // canvas, unsupported browser) - fall through to the text paths below
        // rather than leaving the user with nothing.
      }

      try {
        await navigator.share({ title: entity.name, text: message });
        trackResultShared({ category: entity.category, method: 'web_share_text' });
      } catch (e) {
        // user cancelled or share is unsupported in this context
      }
      return;
    }

    if (typeof window !== 'undefined') {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      trackResultShared({ category: entity.category, method: 'whatsapp_link' });
    }
    return;
  }

  try {
    await Share.share({ message });
    trackResultShared({ category: entity.category, method: 'native_sheet' });
  } catch (e) {
    // user cancelled or share failed
  }
}

/**
 * Shares the monthly recap. Same image-first, text-fallback ladder as
 * shareEntity - the recap card is the more shareable of the two, since it is a
 * personal scoreboard rather than someone else's plant.
 */
export async function shareRecap(recap, labels = {}) {
  const message = i18n.t('recap.shareMessage', {
    month: labels.monthName,
    species: recap.uniqueSpecies,
    total: recap.total,
    url: APP_URL,
  });

  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
    try {
      const blob = await renderRecapCard(recap, {
        monthName: labels.monthName,
        headline: labels.title,
        stats: [
          { value: recap.total, label: i18n.t('recap.stats.total') },
          { value: recap.uniqueSpecies, label: i18n.t('recap.stats.species') },
          { value: recap.categoriesUsed, label: i18n.t('recap.stats.categories') },
          { value: recap.activeDays, label: i18n.t('recap.stats.days') },
        ],
      });
      if (blob) {
        const file = new File([blob], 'naturelens-recap.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: message });
          trackResultShared({ category: 'recap', method: 'web_share_image' });
          return;
        }
      }
    } catch (e) {
      // fall through to text
    }

    try {
      await navigator.share({ text: message });
      trackResultShared({ category: 'recap', method: 'web_share_text' });
    } catch (e) {
      // cancelled
    }
    return;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    trackResultShared({ category: 'recap', method: 'whatsapp_link' });
    return;
  }

  try {
    await Share.share({ message });
    trackResultShared({ category: 'recap', method: 'native_sheet' });
  } catch (e) {
    // cancelled
  }
}
