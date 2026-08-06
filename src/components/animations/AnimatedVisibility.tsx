import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  View,
  StyleProp,
  ViewStyle,
} from "react-native";

type Props = {
  visible: boolean;
  children: React.ReactNode;
  duration?: number;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedVisibility({
  visible,
  children,
  duration = 220,
  style,
}: Props) {
  const [render, setRender] = useState(visible);

  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(visible ? 0 : -10)).current;

  useEffect(() => {
    if (visible) {
      setRender(true);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -6,
          duration: 260,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setRender(false);
      });
    }
  }, [visible]);

  if (!render) {
    return null;
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}