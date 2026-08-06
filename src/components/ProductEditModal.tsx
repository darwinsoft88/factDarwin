import React from "react";
import { EntityEditModal } from "./EntityEditModal";
import { ProductForm, ProductFormValues } from "./ProductForm";

type ProductEditModalProps = {
  editingId: string;
  editingProductName: string;
  form: ProductFormValues;
  saving?: boolean;
  onChange: React.Dispatch<React.SetStateAction<ProductFormValues>>;
  onClose: () => void;
  onOpenScanner: () => void;
  onSave: () => void;
  onVerifyCode: () => void;
  visible: boolean;
};

export function ProductEditModal({
  editingId,
  editingProductName,
  form,
  saving = false,
  onChange,
  onClose,
  onOpenScanner,
  onSave,
  onVerifyCode,
  visible
}: ProductEditModalProps) {
  return (
    <EntityEditModal
      visible={visible}
      title={editingId ? "Editar producto" : "Nuevo producto"}
      subtitle={editingId ? editingProductName : "Registre el producto o servicio"}
      onClose={onClose}
      onConfirm={onSave}
      confirmLabel={editingId ? "Guardar cambios" : "Guardar producto"}
      confirming={saving}
    >
      <ProductForm form={form} onChange={onChange} onOpenScanner={onOpenScanner} onVerifyCode={onVerifyCode} />
    </EntityEditModal>
  );
}
