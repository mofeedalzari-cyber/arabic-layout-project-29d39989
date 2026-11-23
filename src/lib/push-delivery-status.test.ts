import { describe, test } from "node:test";
import { equal } from "node:assert/strict";
import { pushDeliveryStatus } from "./push-delivery-status";

describe("push delivery reporting", () => {
  test("all provider-accepted messages are accepted, not device-confirmed", () => {
    equal(pushDeliveryStatus({ sent: 2, failed: 0 }), "accepted");
  });
  test("a sender mismatch cannot be reported as success", () => {
    equal(pushDeliveryStatus({ sent: 0, failed: 2, error: "SENDER_ID_MISMATCH" }), "failed");
  });
  test("partial delivery is distinct from complete success", () => {
    equal(pushDeliveryStatus({ sent: 1, failed: 1 }), "partial");
  });
  test("no tokens or missing configuration cannot be success", () => {
    equal(pushDeliveryStatus({ sent: 0, failed: 0, skipped: "no-tokens" }), "unavailable");
    equal(pushDeliveryStatus({ sent: 0, failed: 0, skipped: "not-configured" }), "unavailable");
  });
});