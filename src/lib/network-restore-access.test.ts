import { describe, expect, test } from "bun:test";
import { assertNetworkRestoreAccess } from "./network-restore-access";

describe("network restore authorization", () => {
  test("an admin without an owned network cannot start restore", () => {
    expect(() => assertNetworkRestoreAccess(true, null)).toThrow("حسابك غير مرتبط بشبكة تملكها");
  });
  test("a non-admin cannot restore even with an owned network", () => {
    expect(() => assertNetworkRestoreAccess(false, "4664887b-9955-40c1-be8d-d2a934d2c942")).toThrow("استعادة الشبكة متاحة لمدير الشبكة فقط");
  });
  test("a network owner with admin role passes preflight", () => {
    expect(() => assertNetworkRestoreAccess(true, "4664887b-9955-40c1-be8d-d2a934d2c942")).not.toThrow();
  });
});