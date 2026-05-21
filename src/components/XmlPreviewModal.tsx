import React from "react";
import { Modal } from "react-native";
import { TechnicalDetailModal } from "./TechnicalDetailModal";

type XmlPreviewModalProps = {
  value: string;
  onClose: () => void;
};

export function XmlPreviewModal({ value, onClose }: XmlPreviewModalProps) {
  return (
    <Modal visible={Boolean(value)} animationType="slide" onRequestClose={onClose}>
      <TechnicalDetailModal value={value} onClose={onClose} />
    </Modal>
  );
}
