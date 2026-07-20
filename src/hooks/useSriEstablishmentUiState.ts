import { useState } from "react";
import { NewEstablishmentForm } from "../components/NewEstablishmentModal";

export type EstablishmentStatus = { tone: "info" | "success" | "error"; message: string };

const emptyEstablishmentForm: NewEstablishmentForm = {
  name: "",
  establishment: "",
  emissionPoint: "001",
  address: "",
  sequential: "1",
  remissionSequential: "1",
  creditNoteSequential: "1"
};

export function useSriEstablishmentUiState() {
  const [establishmentStatus, setEstablishmentStatus] = useState<EstablishmentStatus | null>(null);
  const [establishmentModalVisible, setEstablishmentModalVisible] = useState(false);
  const [deleteEstablishmentModalVisible, setDeleteEstablishmentModalVisible] = useState(false);
  const [proEstablishmentModalVisible, setProEstablishmentModalVisible] = useState(false);
  const [planUpgradeMessage, setPlanUpgradeMessage] = useState("");
  const [deleteEstablishmentConfirmText, setDeleteEstablishmentConfirmText] = useState("");
  const [deletingEstablishment, setDeletingEstablishment] = useState(false);
  const [establishmentForm, setEstablishmentForm] = useState<NewEstablishmentForm>(emptyEstablishmentForm);

  return {
    deleteEstablishmentConfirmText,
    deleteEstablishmentModalVisible,
    deletingEstablishment,
    establishmentForm,
    establishmentModalVisible,
    establishmentStatus,
    planUpgradeMessage,
    proEstablishmentModalVisible,
    setDeleteEstablishmentConfirmText,
    setDeleteEstablishmentModalVisible,
    setDeletingEstablishment,
    setEstablishmentForm,
    setEstablishmentModalVisible,
    setEstablishmentStatus,
    setPlanUpgradeMessage,
    setProEstablishmentModalVisible
  };
}
