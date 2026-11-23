import { describe, test } from "node:test";
import { equal, rejects } from "node:assert/strict";
import { persistPushToken } from "./push-token-registration";

type Client = Parameters<typeof persistPushToken>[0];
function fakeClient(signedIn: boolean, rpcError: boolean) {
  let calls = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: signedIn ? { user: { id: "test-user" } } : null }, error: null }) },
    rpc: async (name: string, args: { _token: string; _platform: string }) => {
      calls++;
      equal(name, "register_device_token");
      equal(args._platform, "android");
      equal(args._token, "unit-test-token-not-a-device");
      return { error: rpcError ? { message: "permission denied" } : null };
    },
  } as unknown as Client;
  return { client, calls: () => calls };
}

describe("FCM token registration", () => {
  test("does not report signed-out registration as saved", async () => {
    const fake = fakeClient(false, false);
    equal(await persistPushToken(fake.client, "unit-test-token-not-a-device", "android"), false);
    equal(fake.calls(), 0);
  });
  test("resolved RPC errors must fail registration", async () => {
    const fake = fakeClient(true, true);
    await rejects(persistPushToken(fake.client, "unit-test-token-not-a-device", "android"), /PUSH_TOKEN_SAVE_FAILED/);
    equal(fake.calls(), 1);
  });
  test("authenticated successful RPC saves the token", async () => {
    const fake = fakeClient(true, false);
    equal(await persistPushToken(fake.client, "unit-test-token-not-a-device", "android"), true);
    equal(fake.calls(), 1);
  });
});