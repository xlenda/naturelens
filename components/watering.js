export const WATER_INTERVAL_DAYS = {
  'Low (prefers dry soil)': 10,
  'Medium': 5,
  'High (prefers moist soil)': 2,
};

export function getWateringStatus(entry) {
  if (!entry || !Object.prototype.hasOwnProperty.call(WATER_INTERVAL_DAYS, entry.water)) {
    return null;
  }

  const lastWatered = new Date(entry.lastWateredAt || entry.savedAt);
  const msSince = Date.now() - lastWatered.getTime();
  const daysSince = Math.floor(msSince / (1000 * 60 * 60 * 24));

  const intervalDays = WATER_INTERVAL_DAYS[entry.water];
  const dueInDays = intervalDays - daysSince;
  const overdue = dueInDays <= 0;

  // Sem `label` aqui de proposito: uma string montada neste modulo sai em
  // ingles para os 17 idiomas (foi o que aconteceu ate 20/08 - inclusive no
  // layout RTL do arabe). As telas traduzem com t('detail.waterCheckToday')
  // / t('detail.waterCheckInDays', { count }).
  return { overdue, dueInDays };
}
