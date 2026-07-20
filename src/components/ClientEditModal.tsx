import React from "react";
import { ClientForm, ClientFormValues } from "./ClientForm";
import { EntityEditModal } from "./EntityEditModal";

type ClientEditModalProps = {
  editingClientName: string;
  editingId: string;
  form: ClientFormValues;
  lookingUpClient: boolean;
  onChange: React.Dispatch<React.SetStateAction<ClientFormValues>>;
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
  onChange,
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
      onClose={onClose}
      onConfirm={onSave}
      confirmLabel={editingId ? "Guardar cambios" : "Guardar cliente"}
    >
      <ClientForm form={form} lookingUpClient={lookingUpClient} onChange={onChange} onLookupIdentification={onLookupIdentification} />
    </EntityEditModal>
  );
}
