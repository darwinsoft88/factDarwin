import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Empty, Input, Section } from "./common";
import { PaginationControls } from "./PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { AppData, Client, RemissionGuide, Sale } from "../types";
import { getRetryInfo, guideNumber, MAX_DAILY_RETRIES } from "../utils/documents";
import { canRetrySriStatus } from "../utils/invoiceStatus";
import { useAppTheme } from "../theme/AppTheme";
import type { AccentCardTone } from "./ThemedAccentCard";

type GuidesListItemProps = {
  title: string;
  meta: string;
  badge?: string;
  accentTone?: AccentCardTone;
  onOpen?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  retryLabel?: string;
  onRetry?: () => void;
};

function guideAccentTone(status: string): AccentCardTone {
  if (status === "AUTORIZADA") return "success";
  if (status === "DEVUELTA" || status === "ERROR_SRI") return "danger";
  if (["FIRMADA", "ENVIADA", "ENVIADA_SRI", "PENDIENTE_SRI", "EN_REVISION_SRI"].includes(status)) return "info";
  if (status === "ANULADA") return "warning";
  return "primary";
}

type GuideListSectionProps = {
  canOpenSensitive: boolean;
  canRetry: boolean;
  data: AppData;
  filteredGuides: RemissionGuide[];
  guidePage: number;
  guideSearch: string;
  ListItemComponent: React.ComponentType<GuidesListItemProps>;
  visibleGuides: RemissionGuide[];
  onGuideDetail: (guide: RemissionGuide, client: Client | undefined, source: Sale | undefined) => void;
  onGuidePdf: (guide: RemissionGuide, client: Client, source: Sale | undefined) => void;
  onGuideRetry: (guide: RemissionGuide, client: Client | undefined, source: Sale | undefined) => void;
  onGuideSearchChange: (value: string) => void;
  onCreate?: () => void;
  onPageChange: (page: number) => void;
  retryingGuideId: string;
};

export function GuideListSection({
  canOpenSensitive,
  canRetry,
  data,
  filteredGuides,
  guidePage,
  guideSearch,
  ListItemComponent,
  visibleGuides,
  onGuideDetail,
  onGuidePdf,
  onGuideRetry,
  onGuideSearchChange,
  onCreate,
  onPageChange,
  retryingGuideId
}: GuideListSectionProps) {
  const { theme } = useAppTheme();
  return (
    <Section title="">
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Guias emitidas</Text>
        {onCreate ? (
          <Pressable style={[styles.addButton, { backgroundColor: theme.colors.primary }]} onPress={onCreate}>
            <MaterialCommunityIcons name="truck-plus-outline" size={15} color={theme.colors.onPrimary} />
            <Text style={[styles.addButtonText, { color: theme.colors.onPrimary }]}>Nueva guia</Text>
          </Pressable>
        ) : null}
      </View>
      <Input label="Buscar guias emitidas" value={guideSearch} onChangeText={onGuideSearchChange} placeholder="Cliente, placa, ruta, secuencial o clave" autoCapitalize="none" />
      {(data.guides || []).length === 0 ? <Empty text="Aun no hay guias de remision." /> : null}
      {(data.guides || []).length > 0 && filteredGuides.length === 0 ? <Empty text="No hay guias con esa busqueda." /> : null}
      {visibleGuides.map((guide) => {
        const guideClient = data.clients.find((item) => item.id === guide.clientId);
        const source = data.sales.find((item) => item.id === guide.sourceSaleId);
        return (
          <ListItemComponent
            key={guide.id}
            title={`${guideNumber(guide, data.issuer)} - ${guideClient?.name || "Destinatario"}`}
            meta={`${guide.status} | ${guide.plate} | ${guide.route} | ${guide.accessKey}`}
            badge={guide.status}
            accentTone={guideAccentTone(guide.status)}
            onOpen={canOpenSensitive ? () => onGuideDetail(guide, guideClient, source) : undefined}
            secondaryLabel={guide.status === "AUTORIZADA" ? "PDF guia" : undefined}
            onSecondary={() => guideClient && onGuidePdf(guide, guideClient, source)}
            retryLabel={canRetry && canRetrySriStatus(guide.status) ? (retryingGuideId === guide.id ? "..." : `Reintentar ${getRetryInfo(guide).today}/${MAX_DAILY_RETRIES}`) : undefined}
            onRetry={() => onGuideRetry(guide, guideClient, source)}
          />
        );
      })}
      <PaginationControls page={guidePage} pageSize={LIST_BATCH_SIZE} totalItems={filteredGuides.length} onPageChange={onPageChange} />
    </Section>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  title: {
    color: "#1f2937",
    flex: 1,
    fontSize: 17,
    fontWeight: "800"
  },
  addButton: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  }
});
