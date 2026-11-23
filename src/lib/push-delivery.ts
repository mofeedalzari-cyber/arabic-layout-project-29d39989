import { toast } from "sonner";
import type { FcmResult } from "./fcm.server";
import { pushDeliveryStatus } from "./push-delivery-status";

/** Notification failure never rolls back or repeats the already completed transaction. */
export async function reportPushDelivery(task: Promise<FcmResult>): Promise<boolean> {
  try {
    const result = await task;
    const status = pushDeliveryStatus(result);
    if (status === "accepted") return true;
    toast.warning(status === "partial"
      ? "تم حفظ العملية، لكن تعذّر إرسال الإشعار إلى بعض الأجهزة."
      : "تم حفظ العملية، لكن لم يُرسل إشعار الجهاز؛ راجع إعدادات الإشعارات.",
      { id: "karti-push-delivery-warning" });
  } catch {
    toast.warning("تم حفظ العملية، لكن تعذّر الاتصال بخدمة الإشعارات.", { id: "karti-push-delivery-warning" });
  }
  return false;
}