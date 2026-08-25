import React from 'react';
import { Text } from 'react-native';
import { type } from './theme';

// O papel semantico mora junto da aparencia: um titulo nunca vira apenas texto
// visual quando uma tela nova reaproveita o componente.
export default function SectionHeading({ children, style }) {
  return (
    <Text style={[type.sectionTitle, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}
