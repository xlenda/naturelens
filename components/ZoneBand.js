import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from './theme';

// A full-bleed rounded band that a whole section lives inside.
//
// The device (from Cosmic Guide's "zonas de cor"): a premium screen is not one
// flat background with cards floating on it - it has a RHYTHM of dark → a
// shade lighter → dark, where entire sections sit in a band that bleeds past
// the page gutter and the gap between bands is the scene showing through.
//
// Rules that come with it:
//  - the tone is a NEIGHBOUR of the background (colors.zone), never a loud
//    colour: this is depth, not a banner;
//  - it is a pure WRAPPER - it never reorders or filters its children, so the
//    section's own "quente primeiro" order survives untouched;
//  - `gutter` is the screen's horizontal padding, cancelled with a negative
//    margin so the band reaches both edges and the content inside keeps its
//    original alignment.
export default function ZoneBand({ children, gutter = 20, style }) {
  return (
    <View
      style={[
        styles.band,
        { marginHorizontal: -gutter, paddingHorizontal: gutter },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: colors.zone,
    borderRadius: 40,
    paddingTop: 4,
    paddingBottom: 24,
    marginTop: 8,
  },
});
