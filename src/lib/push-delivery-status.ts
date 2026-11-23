import type { FcmResult } from "./fcm.server";

/** Provider acceptance is not proof that a phone displayed a notification. */
export type PushDeliveryStatus = "accepted" | "partial" | "failed" | "unavailable";
export function pushDeliveryStatus(result: FcmResult): PushDeliveryStatus {
  if (result.skipped) return "unavailable";
  if (result.failed > 0 || result.error) return result.sent > 0 ? "partial" : "failed";
  return result.sent > 0 ? "accepted" : "unavailable";
}