export type PaymentKind = "SALE" | "ADDED";
export type CustomerLedgerEntry = { amount: number; payment_kind?: string | null };

export function customerPaymentTotals(entries: readonly CustomerLedgerEntry[]) {
  let salePaid = 0;
  let addedPaid = 0;
  let unclassifiedPaid = 0;
  let charges = 0;
  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (amount < 0) charges -= amount;
    else if (entry.payment_kind === "SALE") salePaid += amount;
    else if (entry.payment_kind === "ADDED") addedPaid += amount;
    else unclassifiedPaid += amount;
  }
  return { salePaid, addedPaid, unclassifiedPaid, charges, paid: salePaid + addedPaid + unclassifiedPaid };
}

export function paymentKindLabel(kind?: string | null) {
  return kind === "SALE" ? "سداد بيع" : kind === "ADDED" ? "سداد المضاف" : "سداد غير مصنف";
}