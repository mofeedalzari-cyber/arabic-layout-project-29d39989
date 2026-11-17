import { describe, test } from "node:test";
import { equal } from "node:assert/strict";
import { isStaleFcmError } from "./fcm.server";

describe("isStaleFcmError", () => {
  test("رمز لم يعد مسجلًا في Firebase يُحذف", () => {
    equal(
      isStaleFcmError(404, '{"error":{"status":"UNREGISTERED","message":"Not Registered"}}'),
      true,
    );
    equal(isStaleFcmError(400, '{"error":{"status":"INVALID_ARGUMENT","message":"bad"}}'), true);
  });

  test("أخطاء مؤقتة أو صلاحيات لا تحذف الرموز", () => {
    equal(isStaleFcmError(403, '{"error":{"status":"PERMISSION_DENIED"}}'), false);
    equal(isStaleFcmError(429, "RESOURCE_EXHAUSTED"), false);
    equal(isStaleFcmError(500, "internal error"), false);
    equal(isStaleFcmError(400, '{"error":{"status":"UNAVAILABLE"}}'), false);
  });
});
