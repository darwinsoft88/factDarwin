import React from "react";
import { QuickClientForm, QuickClientMode } from "../hooks/useQuickSaleClientEditor";
import { ClientEditModal } from "./ClientEditModal";

type QuickClientEditorProps = {
  visible: boolean;
  mode?: QuickClientMode;
  form: QuickClientForm;
  lookingUpClient: boolean;
  onChange: React.Dispatch<React.SetStateAction<QuickClientForm>>;
  onLookupIdentification: () => void;
  onSave: () => void;
  onClose: () => void;
};

export function QuickClientEditor({
  visible,
  mode = "edit",
  form,
  lookingUpClient,
  onChange,
  onLookupIdentification,
  onSave,
  onClose
}: QuickClientEditorProps) {
  const isCreating = mode === "create";

  return (
    <ClientEditModal
      visible={visible}
      editingClientName={isCreating ? "" : form.name || "Cliente"}
      editingId={isCreating ? "" : "quick-sale-client"}
      form={form}
      lookingUpClient={lookingUpClient}
      onChange={onChange}
      onClose={onClose}
      onLookupIdentification={onLookupIdentification}
      onSave={onSave}
    />
  );
}
