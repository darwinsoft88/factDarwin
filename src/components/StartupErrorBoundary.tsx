import React from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

type StartupErrorBoundaryState = {
  message: string;
};

export class StartupErrorBoundary extends React.Component<{ children: React.ReactNode }, StartupErrorBoundaryState> {
  state: StartupErrorBoundaryState = { message: "" };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.message) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc", padding: 18, justifyContent: "center" }}>
          <View style={{ borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", borderRadius: 8, padding: 16, gap: 10 }}>
            <Text style={{ color: "#991b1b", fontSize: 20, fontWeight: "900" }}>FactuDarwin no pudo iniciar</Text>
            <Text style={{ color: "#7f1d1d", lineHeight: 20 }}>{this.state.message}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => this.setState({ message: "" })}
              style={{ backgroundColor: "#0b6f68", borderRadius: 8, padding: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "900" }}>Reintentar</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}
