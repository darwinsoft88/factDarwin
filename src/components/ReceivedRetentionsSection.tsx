import React from "react";
import { LIST_BATCH_SIZE } from "../constants/app";
import { AppData, User } from "../types";
import { canAccessSensitiveSupport } from "../utils/appAccess";
import { ReceivedRetentionsList } from "./ReceivedRetentionsList";
import { Section } from "./common";

type ReceivedRetentionsSectionProps = {
  data: AppData;
  onXml: (xml: string) => void;
  user: User;
};

export function ReceivedRetentionsSection({ data, onXml, user }: ReceivedRetentionsSectionProps) {
  return (
    <Section title="Retenciones recibidas">
      <ReceivedRetentionsList
        retentions={data.receivedRetentions || []}
        sales={data.sales}
        clients={data.clients}
        issuer={data.issuer}
        visibleCount={LIST_BATCH_SIZE}
        canOpenDetail={canAccessSensitiveSupport(user.role)}
        onOpenDetail={onXml}
      />
    </Section>
  );
}
