/** Keep restore authorization explicit before any destructive RPC is called. */
export function assertNetworkRestoreAccess(isAdmin: boolean, networkId: string | null) {
  if (!isAdmin) {
    throw new Error("استعادة الشبكة متاحة لمدير الشبكة فقط. ادخل بحساب مدير الشبكة.");
  }
  if (!networkId) {
    throw new Error("حسابك غير مرتبط بشبكة تملكها. أنشئ شبكة أو اربط حسابك بالشبكة من مدير التطبيق، ثم أعد الاستعادة. لم تُحذف أي بيانات.");
  }
}