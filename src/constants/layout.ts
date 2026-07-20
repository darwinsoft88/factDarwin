import { Platform } from "react-native";

export const KEYBOARD_AVOIDING_BEHAVIOR = Platform.select({
  android: undefined,
  ios: "padding",
  default: undefined
} as const);

export const AUTH_KEYBOARD_BOTTOM_PADDING = Platform.select({
  android: 240,
  ios: 170,
  default: 140
}) ?? 140;

export const MODAL_EDGE_PADDING = 12;
export const MODAL_SAFE_BOTTOM_PADDING = Platform.select({
  android: 34,
  ios: 28,
  default: 18
}) ?? 18;
export const MODAL_CONTENT_BOTTOM_PADDING = MODAL_SAFE_BOTTOM_PADDING + 12;
export const MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING = MODAL_CONTENT_BOTTOM_PADDING + 130;
