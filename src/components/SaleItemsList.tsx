import React from "react";
import { money, calculateLineDiscount, calculateLineSubtotal, calculateLineTax, calculateLineTotal } from "../services/sri";
import { SaleItem } from "../types";
import { ListItem } from "./ListItem";

type SaleItemsListProps = {
  items: SaleItem[];
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
};

export function SaleItemsList({ items, onEdit, onDelete }: SaleItemsListProps) {
  return (
    <>
      {items.map((item, index) => (
        <ListItem
          key={`${item.productId}-${index}`}
          title={`${item.quantity} x ${item.name}`}
          meta={`Base $${money(calculateLineSubtotal(item))} | Desc. $${money(calculateLineDiscount(item))} | IVA $${money(calculateLineTax(item))} | Total $${money(calculateLineTotal(item))}`}
          editLabel="Editar"
          onEdit={() => onEdit(index)}
          onDelete={() => onDelete(index)}
        />
      ))}
    </>
  );
}
