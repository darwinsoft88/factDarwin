import React from "react";
import { AppContent } from "./src/AppContent";
import { StartupErrorBoundary } from "./src/components/StartupErrorBoundary";
import { installWebDomGuards } from "./src/utils/webDomGuards";

export default function App() {
  installWebDomGuards();

  return (
    <StartupErrorBoundary>
      <AppContent />
    </StartupErrorBoundary>
  );
}
