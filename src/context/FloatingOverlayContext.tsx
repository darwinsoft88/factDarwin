import React, { createContext, useContext } from "react";

type FloatingOverlayContextValue = {
  setOverlay: (overlay: React.ReactNode) => void;
};

export const FloatingOverlayContext = createContext<FloatingOverlayContextValue>({
  setOverlay: () => undefined
});

export function useFloatingOverlay() {
  return useContext(FloatingOverlayContext);
}
