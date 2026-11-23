import { describe, test } from "node:test";
import { equal } from "node:assert/strict";
import { customerPaymentTotals } from "./customer-payment-totals";

describe("customer repayment categories", () => {
  test("added repayments are separate from sale repayments", () => {
    const totals = customerPaymentTotals([
      { amount: -480 },
      { amount: 100, payment_kind: "ADDED" },
      { amount: 280, payment_kind: "SALE" },
    ]);
    equal(totals.addedPaid, 100);
    equal(totals.salePaid, 280);
    equal(totals.paid, 380);
    equal(totals.charges, 480);
  });
  test("legacy repayments remain unclassified and still reduce the balance", () => {
    const totals = customerPaymentTotals([{ amount: 380, payment_kind: null }]);
    equal(totals.unclassifiedPaid, 380);
    equal(totals.salePaid, 0);
    equal(totals.addedPaid, 0);
    equal(630 + 480 - totals.paid, 730);
  });
});