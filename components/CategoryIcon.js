import React from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Ionicons has no mushroom, tree or bird glyph (mushroom's closest match,
// "nutrition", is an apple icon) - route these to MaterialCommunityIcons
// instead, which has real "mushroom"/"mushroom-outline" and "tree"/
// "tree-outline" pairs. Everything else stays on Ionicons so existing icon
// names across the app keep working unchanged.
//
// Bird is the odd one out: MaterialCommunityIcons has "bird" but ships NO
// "bird-outline" variant (verified against the installed glyphmap, not
// assumed), so the bird category deliberately uses the same solid glyph for
// both its active and inactive tab states. Fish needs no special-casing at all
// - Ionicons has both "fish" and "fish-outline".
const MATERIAL_ICON_NAMES = new Set([
  'mushroom',
  'mushroom-outline',
  'tree',
  'tree-outline',
  'bird',
]);

export default function CategoryIcon({ name, ...props }) {
  if (MATERIAL_ICON_NAMES.has(name)) {
    return <MaterialCommunityIcons name={name} {...props} />;
  }
  return <Ionicons name={name} {...props} />;
}
