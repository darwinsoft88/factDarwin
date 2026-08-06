import React from "react";
import { AppContent } from "./src/AppContent";
import { AppOverlayProvider, AppToast } from "./src/components/AppToast";
import { StartupErrorBoundary } from "./src/components/StartupErrorBoundary";
import { installWebDomGuards } from "./src/utils/webDomGuards";

export default function App() {
  installWebDomGuards();

  return (
    <StartupErrorBoundary>
      <>
        <AppOverlayProvider>
          <AppContent />
        </AppOverlayProvider>
        <AppToast global />
      </>
    </StartupErrorBoundary>
  );
}
