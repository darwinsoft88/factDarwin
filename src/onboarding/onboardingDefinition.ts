import type { OnboardingStepId } from "./onboardingTypes";

export const onboardingDefinition: ReadonlyArray<{
  id: OnboardingStepId;
  title: string;
  description: string;
  optional: boolean;
}> = [
  { id: "business", title: "Configura tu empresa", description: "Completa el perfil tributario, establecimiento, punto de emisión y numeraciones iniciales.", optional: false },
  { id: "product", title: "Agrega un producto o servicio", description: "Crea el primer artículo que vas a vender.", optional: false },
  { id: "own-client", title: "Agrega tu primer cliente", description: "Registra los datos de un cliente para tus ventas.", optional: false },
  { id: "first-sale", title: "Registra tu primera venta", description: "Realiza una venta con el producto y cliente creados.", optional: false }
];
