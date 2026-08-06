import React, { useState } from "react";
import { QuickClientForm, QuickClientMode } from "../hooks/useQuickSaleClientEditor";
import { ClientEditModal } from "./ClientEditModal";

type QuickClientEditorProps = {
  visible: boolean;
  mode?: QuickClientMode;
  form: QuickClientForm;
  lookingUpClient: boolean;
  onChange: React.Dispatch<React.SetStateAction<QuickClientForm>>;
  onLookupIdentification: () => void;
  onSave: () => void | Promise<void>;
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
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ClientEditModal
      visible={visible}
      editingClientName={isCreating ? "" : form.name || "Cliente"}
      editingId={isCreating ? "" : "quick-sale-client"}
      form={form}
      lookingUpClient={lookingUpClient}
      saving={saving}
      onChange={onChange}
      onClose={onClose}
      onLookupIdentification={onLookupIdentification}
      onSave={() => { void save(); }}
    />
  );
}
