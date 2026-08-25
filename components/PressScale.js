import React, { useCallback, useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import useReducedMotion from './useReducedMotion';

// Press-scale as an OUTER WRAPPER around an existing Touchable.
//
// Two reasons it is a wrapper and not a prop on the Touchable itself, both
// learned the expensive way in Cosmic Guide:
//
//  1. On react-native-web, an Animated.Value in the style of the Touchable
//     itself does not drive the transform - it has to be an Animated.View
//     around it.
//  2. Wrapping leaves the Touchable BYTE FOR BYTE unchanged: accessibilityRole,
//     accessibilityLabel, testID, activeOpacity and onPress all keep working
//     exactly as before, so adding polish cannot break behaviour or tests.
//
// The animation never delays onPress - it only listens to onPressIn/onPressOut,
// which fire alongside, not before, the press handler.
export default function PressScale({ children, scaleTo = 0.97, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animation = useRef(null);
  const reduceMotion = useReducedMotion();

  const spring = useCallback((toValue) => {
    animation.current?.stop();
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    animation.current = Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      friction: 7,
      tension: 180,
    });
    animation.current.start();
  }, [reduceMotion, scale]);

  useEffect(() => {
    if (reduceMotion) {
      animation.current?.stop();
      scale.setValue(1);
    }
    return () => animation.current?.stop();
  }, [reduceMotion, scale]);

  const child = React.Children.only(children);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      {React.cloneElement(child, {
        onPressIn: (e) => {
          spring(scaleTo);
          child.props.onPressIn?.(e);
        },
        onPressOut: (e) => {
          spring(1);
          child.props.onPressOut?.(e);
        },
      })}
    </Animated.View>
  );
}
