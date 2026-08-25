'use strict';

// Este manifesto descreve apenas o que a pessoa pode registrar. Ele nao
// transforma categoria, foto ou anotacao em diagnostico nem recomendacao.

const LEVELS = Object.freeze([
  Object.freeze({ key: 'essential', icon: 'clipboard-outline', labelKey: 'observationWorkspace.tabs.essential' }),
  Object.freeze({ key: 'learn', icon: 'school-outline', labelKey: 'observationWorkspace.tabs.learn' }),
  Object.freeze({ key: 'field', icon: 'trail-sign-outline', labelKey: 'observationWorkspace.tabs.field' }),
]);

const context = (category, key, icon) => Object.freeze({
  key,
  icon,
  labelKey: `observationWorkspace.contexts.${category}.${key}`,
});

const eventType = (category, key, icon) => Object.freeze({
  key,
  icon,
  labelKey: `observationWorkspace.eventTypes.${category}.${key}`,
});

const unit = (key, value) => Object.freeze({
  key,
  value,
  labelKey: `observationWorkspace.units.${key}`,
});

const visual = (category, key, icon, colorToken, diagram) => Object.freeze({
  key,
  icon,
  colorToken,
  diagram,
  titleKey: `observationWorkspace.visuals.${category}.${key}.title`,
  bodyKey: `observationWorkspace.visuals.${category}.${key}.body`,
});

const MM = unit('millimetre', 'mm');
const CM = unit('centimetre', 'cm');
const M = unit('metre', 'm');
const KM = unit('kilometre', 'km');
const ML = unit('millilitre', 'ml');
const L = unit('litre', 'l');
const CELSIUS = unit('celsius', 'celsius');
const PERCENT = unit('percent', 'percent');
const G = unit('gram', 'g');
const KG = unit('kilogram', 'kg');
const PH = unit('ph', 'ph');
const PPT = unit('ppt', 'ppt');
const PPM = unit('ppm', 'ppm');
const MG_PER_L = unit('milligramPerLitre', 'mgPerL');
const US_PER_CM = unit('microsiemensPerCentimetre', 'usPerCm');
const SECOND = unit('second', 'second');
const MINUTE = unit('minute', 'minute');
const HOUR = unit('hour', 'hour');
const HERTZ = unit('hertz', 'hertz');
const KILOHERTZ = unit('kilohertz', 'kilohertz');
const DECIBEL = unit('decibel', 'decibel');

const profile = ({
  key,
  icon,
  accent,
  contexts,
  eventTypes,
  units,
  visualTopics,
  allowsCount,
  allowsMeasure,
  safetyKey = null,
}) => Object.freeze({
  key,
  icon,
  accent,
  levels: LEVELS,
  contexts: Object.freeze(contexts),
  eventTypes: Object.freeze(eventTypes),
  units: Object.freeze(units),
  visualTopics: Object.freeze(visualTopics),
  allowsCount,
  allowsMeasure,
  safetyKey,
});

const CONFIG_BY_CATEGORY = Object.freeze({
  plant: profile({
    key: 'plant', icon: 'leaf-outline', accent: 'accent',
    allowsCount: true, allowsMeasure: true, units: [MM, CM, M, ML, L, CELSIUS, PERCENT],
    contexts: [
      context('plant', 'indoor', 'home-outline'),
      context('plant', 'outdoor', 'sunny-outline'),
      context('plant', 'container', 'cube-outline'),
      context('plant', 'ground', 'earth-outline'),
    ],
    eventTypes: [
      eventType('plant', 'observation', 'eye-outline'),
      eventType('plant', 'growth', 'trending-up-outline'),
      eventType('plant', 'leafChange', 'leaf-outline'),
      eventType('plant', 'flowering', 'flower-outline'),
      eventType('plant', 'fruiting', 'nutrition-outline'),
      eventType('plant', 'symptom', 'alert-circle-outline'),
      eventType('plant', 'care', 'clipboard-outline'),
    ],
    visualTopics: [
      visual('plant', 'environment', 'compass-outline', 'accent', 'grid'),
      visual('plant', 'light', 'sunny-outline', 'warning', 'compare'),
      visual('plant', 'soil', 'layers-outline', 'purple', 'layers'),
      visual('plant', 'growth', 'trending-up-outline', 'info', 'timeline'),
    ],
  }),
  tree: profile({
    key: 'tree', icon: 'git-branch-outline', accent: 'accent',
    allowsCount: true, allowsMeasure: true, units: [MM, CM, M, ML, L, CELSIUS, PERCENT],
    contexts: [
      context('tree', 'urban', 'business-outline'),
      context('tree', 'garden', 'leaf-outline'),
      context('tree', 'woodland', 'trail-sign-outline'),
      context('tree', 'orchard', 'grid-outline'),
    ],
    eventTypes: [
      eventType('tree', 'observation', 'eye-outline'),
      eventType('tree', 'growth', 'trending-up-outline'),
      eventType('tree', 'leafChange', 'leaf-outline'),
      eventType('tree', 'flowering', 'flower-outline'),
      eventType('tree', 'fruiting', 'nutrition-outline'),
      eventType('tree', 'symptom', 'alert-circle-outline'),
      eventType('tree', 'habitat', 'earth-outline'),
    ],
    visualTopics: [
      visual('tree', 'environment', 'compass-outline', 'accent', 'grid'),
      visual('tree', 'light', 'sunny-outline', 'warning', 'compare'),
      visual('tree', 'soil', 'layers-outline', 'purple', 'layers'),
      visual('tree', 'growth', 'git-branch-outline', 'info', 'timeline'),
    ],
  }),
  insect: profile({
    key: 'insect', icon: 'bug-outline', accent: 'purple',
    allowsCount: true, allowsMeasure: true, units: [MM, CM, M, CELSIUS, PERCENT],
    contexts: [
      context('insect', 'onPlant', 'leaf-outline'),
      context('insect', 'onSoil', 'earth-outline'),
      context('insect', 'onStructure', 'home-outline'),
      context('insect', 'nearWater', 'water-outline'),
    ],
    eventTypes: [
      eventType('insect', 'observation', 'eye-outline'),
      eventType('insect', 'count', 'apps-outline'),
      eventType('insect', 'lifeStage', 'repeat-outline'),
      eventType('insect', 'behavior', 'walk-outline'),
      eventType('insect', 'interaction', 'git-compare-outline'),
      eventType('insect', 'habitat', 'location-outline'),
    ],
    visualTopics: [
      visual('insect', 'anatomy', 'bug-outline', 'purple', 'anatomy'),
      visual('insect', 'stage', 'repeat-outline', 'info', 'timeline'),
      visual('insect', 'count', 'apps-outline', 'accent', 'count'),
      visual('insect', 'behaviour', 'eye-outline', 'warning', 'compare'),
    ],
  }),
  mushroom: profile({
    key: 'mushroom', icon: 'umbrella-outline', accent: 'warning',
    allowsCount: true, allowsMeasure: true, units: [MM, CM, M, CELSIUS, PERCENT],
    safetyKey: 'observationWorkspace.mushroomSafety',
    contexts: [
      context('mushroom', 'soil', 'earth-outline'),
      context('mushroom', 'wood', 'git-branch-outline'),
      context('mushroom', 'leafLitter', 'leaf-outline'),
      context('mushroom', 'otherSubstrate', 'ellipsis-horizontal-outline'),
    ],
    eventTypes: [
      eventType('mushroom', 'observation', 'eye-outline'),
      eventType('mushroom', 'emergence', 'trending-up-outline'),
      eventType('mushroom', 'morphology', 'umbrella-outline'),
      eventType('mushroom', 'substrate', 'earth-outline'),
      eventType('mushroom', 'colorChange', 'color-palette-outline'),
      eventType('mushroom', 'sporePrint', 'finger-print-outline'),
    ],
    visualTopics: [
      visual('mushroom', 'substrate', 'earth-outline', 'accent', 'layers'),
      visual('mushroom', 'anatomy', 'umbrella-outline', 'purple', 'anatomy'),
      visual('mushroom', 'underside', 'reorder-three-outline', 'info', 'compare'),
      visual('mushroom', 'colourChange', 'color-palette-outline', 'warning', 'timeline'),
    ],
  }),
  fish: profile({
    key: 'fish', icon: 'fish-outline', accent: 'info',
    allowsCount: true, allowsMeasure: true, units: [MM, CM, M, G, KG, CELSIUS, PH, PPT, PPM, MG_PER_L, US_PER_CM],
    contexts: [
      context('fish', 'freshwater', 'water-outline'),
      context('fish', 'marine', 'boat-outline'),
      context('fish', 'estuary', 'swap-horizontal-outline'),
      context('fish', 'aquarium', 'cube-outline'),
    ],
    eventTypes: [
      eventType('fish', 'observation', 'eye-outline'),
      eventType('fish', 'count', 'apps-outline'),
      eventType('fish', 'behavior', 'fish-outline'),
      eventType('fish', 'habitat', 'water-outline'),
      eventType('fish', 'waterReading', 'speedometer-outline'),
      eventType('fish', 'feeding', 'restaurant-outline'),
    ],
    visualTopics: [
      visual('fish', 'habitat', 'water-outline', 'info', 'layers'),
      visual('fish', 'anatomy', 'fish-outline', 'purple', 'anatomy'),
      visual('fish', 'group', 'apps-outline', 'accent', 'count'),
      visual('fish', 'behaviour', 'eye-outline', 'warning', 'compare'),
    ],
  }),
  bird: profile({
    key: 'bird', icon: 'paw-outline', accent: 'warning',
    allowsCount: true, allowsMeasure: true, units: [CM, M, KM, SECOND, MINUTE, HOUR, HERTZ, KILOHERTZ, DECIBEL],
    contexts: [
      context('bird', 'urban', 'business-outline'),
      context('bird', 'forest', 'leaf-outline'),
      context('bird', 'wetland', 'water-outline'),
      context('bird', 'openArea', 'sunny-outline'),
    ],
    eventTypes: [
      eventType('bird', 'observation', 'eye-outline'),
      eventType('bird', 'count', 'apps-outline'),
      eventType('bird', 'behavior', 'paw-outline'),
      eventType('bird', 'vocalization', 'musical-notes-outline'),
      eventType('bird', 'nesting', 'home-outline'),
      eventType('bird', 'flight', 'navigate-outline'),
    ],
    visualTopics: [
      visual('bird', 'habitat', 'location-outline', 'accent', 'layers'),
      visual('bird', 'anatomy', 'paw-outline', 'purple', 'anatomy'),
      visual('bird', 'group', 'apps-outline', 'info', 'count'),
      visual('bird', 'vocalisation', 'musical-notes-outline', 'warning', 'waveform'),
    ],
  }),
  sound: profile({
    key: 'sound', icon: 'mic-outline', accent: 'purple',
    allowsCount: false, allowsMeasure: true, units: [SECOND, MINUTE, HOUR, HERTZ, KILOHERTZ, DECIBEL],
    contexts: [
      context('sound', 'dawn', 'partly-sunny-outline'),
      context('sound', 'day', 'sunny-outline'),
      context('sound', 'dusk', 'cloudy-night-outline'),
      context('sound', 'night', 'moon-outline'),
    ],
    eventTypes: [
      eventType('sound', 'observation', 'ear-outline'),
      eventType('sound', 'recording', 'mic-outline'),
      eventType('sound', 'comparison', 'git-compare-outline'),
      eventType('sound', 'context', 'location-outline'),
      eventType('sound', 'frequency', 'pulse-outline'),
      eventType('sound', 'amplitude', 'analytics-outline'),
    ],
    visualTopics: [
      visual('sound', 'waveform', 'pulse-outline', 'purple', 'waveform'),
      visual('sound', 'rhythm', 'repeat-outline', 'info', 'timeline'),
      visual('sound', 'environment', 'location-outline', 'accent', 'layers'),
      visual('sound', 'comparison', 'git-compare-outline', 'warning', 'compare'),
    ],
  }),
});

const OBSERVATION_WORKSPACE_CATEGORIES = Object.freeze(Object.keys(CONFIG_BY_CATEGORY));

const OBSERVATION_EVENT_TYPES_BY_CATEGORY = Object.freeze(Object.fromEntries(
  OBSERVATION_WORKSPACE_CATEGORIES.map((category) => [
    category,
    Object.freeze(CONFIG_BY_CATEGORY[category].eventTypes.map(({ key }) => key)),
  ])
));

const OBSERVATION_UNITS_BY_CATEGORY = Object.freeze(Object.fromEntries(
  OBSERVATION_WORKSPACE_CATEGORIES.map((category) => [
    category,
    Object.freeze(CONFIG_BY_CATEGORY[category].units.map(({ value }) => value)),
  ])
));

function getObservationWorkspaceConfig(category) {
  if (typeof category !== 'string') return null;
  return CONFIG_BY_CATEGORY[category.trim().toLowerCase()] || null;
}

module.exports = {
  OBSERVATION_WORKSPACE_CATEGORIES,
  OBSERVATION_EVENT_TYPES_BY_CATEGORY,
  OBSERVATION_UNITS_BY_CATEGORY,
  getObservationWorkspaceConfig,
};
