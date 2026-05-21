import React from "react";
import { PaymentMethod } from "../types";
import { paymentOptions } from "../constants/options";
import { Select } from "./common";

type PaymentMethodPickerProps = {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
};

export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
  return (
    <Select label="Forma de pago" value={value} onChange={(nextValue) => onChange(nextValue as PaymentMethod)} options={paymentOptions} />
  );
}
