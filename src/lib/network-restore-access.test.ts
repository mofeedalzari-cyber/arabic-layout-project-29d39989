import { describe, test } from "node:test";
import { throws, doesNotThrow } from "node:assert/strict";
import { assertNetworkRestoreAccess } from "./network-restore-access";

describe("network restore authorization", () => {
  test("an admin without an owned network cannot start restore", () => {
    throws(() => assertNetworkRestoreAccess(true, null), /حسابك غير مرتبط بشبكة تملكها/);
  });
  test("a non-admin cannot restore even with an owned network", () => {
    throws(() => assertNetworkRestoreAccess(false, "4664887b-9955-40c1-be8d-d2a934d2c942"), /استعادة الشبكة متاحة لمدير الشبكة فقط/);
  });
  test("a network owner with admin role passes preflight", () => {
    doesNotThrow(() => assertNetworkRestoreAccess(true, "4664887b-9955-40c1-be8d-d2a934d2c942"));
  });
});