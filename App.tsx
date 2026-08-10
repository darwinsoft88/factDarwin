import React from "react";
import { AppContent } from "./src/AppContent";
import { AppOverlayProvider, AppToast } from "./src/components/AppToast";
import { StartupErrorBoundary } from "./src/components/StartupErrorBoundary";
import { installWebDomGuards } from "./src/utils/webDomGuards";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function App() {
  installWebDomGuards();

  return (
    <StartupErrorBoundary>
      <SafeAreaProvider>
        <AppOverlayProvider>
          <AppContent />
        </AppOverlayProvider>

        <AppToast global />
      </SafeAreaProvider>
    </StartupErrorBoundary>
  );
}
