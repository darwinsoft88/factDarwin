import React from "react";
import { ClientForm, ClientFormValues } from "./ClientForm";
import { EntityEditModal } from "./EntityEditModal";

type ClientEditModalProps = {
  editingClientName: string;
  editingId: string;
  form: ClientFormValues;
  lookingUpClient: boolean;
  saving?: boolean;
  onChange: React.Dispatch<React.SetStateAction<ClientFormValues>>;
  onClosed?: () => void;
  onClose: () => void;
  onLookupIdentification: () => void;
  onSave: () => void;
  visible: boolean;
};

export function ClientEditModal({
  editingClientName,
  editingId,
  form,
  lookingUpClient,
  saving = false,
  onChange,
  onClosed,
  onClose,
  onLookupIdentification,
  onSave,
  visible
}: ClientEditModalProps) {
  return (
    <EntityEditModal
      visible={visible}
      title={editingId ? "Editar cliente" : "Nuevo cliente"}
      subtitle={editingId ? editingClientName : "Registre los datos del cliente"}
      onClosed={onClosed}
      onClose={onClose}
      onConfirm={onSave}
      confirmLabel={editingId ? "Guardar cambios" : "Guardar cliente"}
      confirming={saving}
    >
      <ClientForm form={form} lookingUpClient={lookingUpClient} onChange={onChange} onLookupIdentification={onLookupIdentification} />
    </EntityEditModal>
  );
}
