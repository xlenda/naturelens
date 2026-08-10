import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from './theme';

// The layered scene that turns a flat background into a PLACE.
//
// Ported as a DEVICE (not as code) from Cosmic Guide's CosmicScene: gradient
// sky + deterministic floating particles + hill waves without SVG. Here the
// sky is a forest dusk and the particles are pollen/spores rather than stars,
// because the app is about what grows, not about what orbits.
//
// Three rules carried over verbatim, each of them a bug someone already paid
// for:
//
//  1. DETERMINISTIC particles. `Math.random()` per render makes the field
//     "crawl" on every state change - computed once at module load from a
//     sine hash, so the scene is identical for the life of the session.
//  2. `pointerEvents="none"` on the WHOLE scene. Decoration must never steal a
//     touch from the content above it.
//  3. It is the FIRST child of the screen root, and the root keeps its own
//     backgroundColor underneath - the scene paints over that, never replaces
//     it.

// 34 motes, fixed at module load. The sine hash keeps them irregular-looking
// without a PRNG, and identical across reloads.
const MOTES = Array.from({ length: 34 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  const c = Math.sin(i * 4.1414) * 9876.5432;
  return {
    left: `${Math.abs(a - Math.floor(a)) * 100}%`,
    top: `${Math.abs(b - Math.floor(b)) * 62}%`,
    size: 1.5 + Math.abs(c - Math.floor(c)) * 2.4,
    opacity: 0.10 + Math.abs(a - Math.floor(a)) * 0.20,
  };
});

export default function NatureScene({ accent = colors.accent }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[colors.sky, colors.skyMid, colors.background]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {MOTES.map((m, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            borderRadius: m.size,
            backgroundColor: colors.accentLight,
            opacity: m.opacity,
          }}
        />
      ))}

      {/* Three hill waves. Views 170% wide with a 999 radius and a degree or
          two of rotation read as rolling ground - no SVG, no asset, and they
          survive any screen width. */}
      <View style={[styles.hill, styles.hillBack, { backgroundColor: accent + '14' }]} />
      <View style={[styles.hill, styles.hillMid, { backgroundColor: accent + '1E' }]} />
      <View style={[styles.hill, styles.hillFront, { backgroundColor: colors.surface }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hill: {
    position: 'absolute',
    left: '-35%',
    width: '170%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  hillBack: { bottom: 96, height: 200, transform: [{ rotate: '-2deg' }] },
  hillMid: { bottom: 40, height: 190, transform: [{ rotate: '1.5deg' }] },
  hillFront: { bottom: -60, height: 180, opacity: 0.55 },
});
