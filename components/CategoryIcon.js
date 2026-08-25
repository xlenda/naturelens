import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// Icones NatureLens v2: usa glifos profissionais como base e aplica uma
// assinatura discreta nas categorias. A v1 tentava desenhar tudo com Views e
// ficou artesanal demais; aqui o acabamento volta a ser premium sem perder
// identidade visual.
const MATERIAL_ICON_NAMES = new Set([
  'mushroom',
  'mushroom-outline',
  'tree',
  'tree-outline',
  'bird',
]);

const CATEGORY_ICON_NAMES = new Set([
  'leaf',
  'leaf-outline',
  'flower',
  'flower-outline',
  'tree',
  'tree-outline',
  'bug',
  'bug-outline',
  'mushroom',
  'mushroom-outline',
  'nutrition',
  'nutrition-outline',
  'fish',
  'fish-outline',
  'bird',
  'bird-outline',
  'mic',
  'mic-outline',
  'volume-high',
  'volume-high-outline',
  'compass',
  'compass-outline',
  'file-tray-full',
  'file-tray-full-outline',
  'person-circle',
  'person-circle-outline',
  'sparkles',
  'sparkles-outline',
]);

const ICON_ALIASES = {
  'bird-outline': 'bird',
  'flower': 'leaf',
  'flower-outline': 'leaf-outline',
  'nutrition': 'leaf',
  'nutrition-outline': 'leaf-outline',
  'volume-high': 'mic',
  'volume-high-outline': 'mic-outline',
};

function isOutline(name) {
  return typeof name === 'string' && name.endsWith('-outline');
}

function resolveName(name) {
  return ICON_ALIASES[name] || name;
}

function BaseIcon({ name, size, color, style, ...props }) {
  const resolvedName = resolveName(name);
  if (MATERIAL_ICON_NAMES.has(resolvedName)) {
    return <MaterialCommunityIcons name={resolvedName} size={size} color={color} style={style} {...props} />;
  }
  return <Ionicons name={resolvedName} size={size} color={color} style={style} {...props} />;
}

function BrandLeaf({ color, size }) {
  const s = Math.max(5, size * 0.28);
  return (
    <View
      style={[
        styles.brandLeaf,
        {
          width: s,
          height: s * 0.68,
          borderRadius: s,
          backgroundColor: color,
        },
      ]}
    />
  );
}

function PremiumCategoryIcon({ name, size, color, style, ...props }) {
  const outlined = isOutline(name);
  const shellSize = Math.max(size + 6, 24);
  const iconSize = Math.max(12, size - 1);
  const halo = typeof color === 'string' && color.startsWith('#') ? `${color}1F` : 'rgba(127,199,154,0.15)';
  const border = typeof color === 'string' && color.startsWith('#') ? `${color}38` : 'rgba(127,199,154,0.28)';

  return (
    <View
      style={[
        styles.shell,
        {
          width: shellSize,
          height: shellSize,
          borderRadius: Math.max(10, shellSize * 0.38),
          backgroundColor: outlined ? 'transparent' : halo,
          borderColor: outlined ? 'transparent' : border,
        },
        style,
      ]}
      {...props}
    >
      <View
        style={[
          styles.innerGlow,
          {
            width: shellSize * 0.58,
            height: shellSize * 0.58,
            borderRadius: shellSize,
            backgroundColor: halo,
            opacity: outlined ? 0 : 1,
          },
        ]}
      />
      <BaseIcon name={name} size={iconSize} color={color} />
      {!outlined && shellSize >= 27 ? <BrandLeaf color={color} size={shellSize} /> : null}
    </View>
  );
}

export function isCustomNatureIcon(name) {
  return CATEGORY_ICON_NAMES.has(name);
}

export default function CategoryIcon({ name, size = 24, color = '#7FC79A', style, ...props }) {
  if (CATEGORY_ICON_NAMES.has(name)) {
    return <PremiumCategoryIcon name={name} size={size} color={color} style={style} {...props} />;
  }
  return <BaseIcon name={name} size={size} color={color} style={style} {...props} />;
}

export { CATEGORY_ICON_NAMES };

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  innerGlow: {
    position: 'absolute',
    transform: [{ translateX: -2 }, { translateY: -2 }],
  },
  brandLeaf: {
    position: 'absolute',
    right: 4,
    bottom: 3,
    transform: [{ rotate: '-34deg' }],
    opacity: 0.92,
  },
});
