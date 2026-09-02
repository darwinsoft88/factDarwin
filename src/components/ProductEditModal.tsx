import React from "react";
import { EntityEditModal } from "./EntityEditModal";
import { ProductForm, ProductFormValues } from "./ProductForm";
import { ProductImageDraft, ProductImageField } from "./ProductImageField";
import type { Product } from "../types";

type ProductEditModalProps = {
  editingId: string;
  editingProductName: string;
  form: ProductFormValues;
  saving?: boolean;
  onChange: React.Dispatch<React.SetStateAction<ProductFormValues>>;
  onClose: () => void;
  onOpenScanner: () => void;
  onSave: () => void;
  visible: boolean;
  product?: Product;
  backendUrl: string;
  backendToken: string;
  imageDraft: ProductImageDraft;
  removeCurrentImage: boolean;
  onImageChange: (value: ProductImageDraft) => void;
  onImageRemove: () => void;
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
  visible, product, backendUrl, backendToken, imageDraft, removeCurrentImage, onImageChange, onImageRemove
}: ProductEditModalProps) {
  return (
    <EntityEditModal
      adaptiveViewport
      visible={visible}
      title={editingId ? "Editar producto" : "Nuevo producto"}
      subtitle={editingId ? editingProductName : "Registre el producto o servicio"}
      onClose={onClose}
      onConfirm={onSave}
      confirmLabel={editingId ? "Guardar cambios" : "Guardar producto"}
      confirming={saving}
    >
      <ProductImageField product={product} backendUrl={backendUrl} token={backendToken} draft={imageDraft} removeCurrent={removeCurrentImage} onChange={onImageChange} onRemove={onImageRemove} />
      <ProductForm form={form} onChange={onChange} onOpenScanner={onOpenScanner} />
    </EntityEditModal>
  );
}
