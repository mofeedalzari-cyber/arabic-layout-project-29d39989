import { describe, test } from "node:test";
import { equal } from "node:assert/strict";
import { isStaleFcmError } from "./fcm.server";

describe("isStaleFcmError", () => {
  test("رمز لم يعد مسجلًا في Firebase يُحذف", () => {
    equal(
      isStaleFcmError(404, '{"error":{"status":"UNREGISTERED","message":"Not Registered"}}'),
      true,
    );
    equal(isStaleFcmError(400, '{"error":{"status":"INVALID_ARGUMENT","message":"bad"}}'), false);
  });

  test("أخطاء مؤقتة أو صلاحيات لا تحذف الرموز", () => {
    equal(isStaleFcmError(404, '{"error":{"status":"NOT_FOUND"}}'), false);
    equal(isStaleFcmError(404, 'not json'), false);
    equal(isStaleFcmError(403, '{"error":{"status":"PERMISSION_DENIED"}}'), false);
    equal(isStaleFcmError(429, "RESOURCE_EXHAUSTED"), false);
    equal(isStaleFcmError(500, "internal error"), false);
    equal(isStaleFcmError(400, '{"error":{"status":"UNAVAILABLE"}}'), false);
  });
  test("رمز غير مسجل مثبت بتفاصيل FCM فقط", () => {
    equal(isStaleFcmError(404, '{"error":{"status":"NOT_FOUND","details":[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError","errorCode":"UNREGISTERED"}]}}'), true);
  });
});
