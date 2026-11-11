import { describe, expect, it } from "vitest";
import { DeviceFlowError, pollForToken, requestDeviceCode, type DeviceCode, type PostForm } from "../src/obsidian/github-oauth";

const code: DeviceCode = {
  deviceCode: "dev",
  userCode: "ABCD-1234",
  verificationUri: "https://github.com/login/device",
  interval: 5,
  expiresIn: 900,
};

/** Answers each poll from `replies`, in order, and records how long it was asked to wait. */
function scripted(replies: Record<string, unknown>[]) {
  const waits: number[] = [];
  const posts: { url: string; form: Record<string, string> }[] = [];
  const post: PostForm = async (url, form) => {
    posts.push({ url, form });
    return replies.shift() ?? {};
  };
  return { post, waits, posts, sleep: async (ms: number) => void waits.push(ms) };
}

describe("device flow", () => {
  it("requests a code with the repo scope", async () => {
    const { post, posts } = scripted([
      { device_code: "d", user_code: "U", verification_uri: "https://github.com/login/device", interval: 7, expires_in: 600 },
    ]);
    const result = await requestDeviceCode(post, "client");
    expect(result).toMatchObject({ deviceCode: "d", userCode: "U", interval: 7, expiresIn: 600 });
    expect(posts[0].form).toEqual({ client_id: "client", scope: "repo" });
  });

  it("says so when no client id is configured, without calling GitHub", async () => {
    const { post, posts } = scripted([]);
    await expect(requestDeviceCode(post, "")).rejects.toMatchObject({ code: "unconfigured" });
    expect(posts).toHaveLength(0);
  });

  it("keeps polling while pending, and returns the token", async () => {
    const s = scripted([{ error: "authorization_pending" }, { error: "authorization_pending" }, { access_token: "gho_x" }]);
    await expect(pollForToken(s.post, code, { clientId: "c", sleep: s.sleep })).resolves.toBe("gho_x");
    expect(s.waits).toEqual([5000, 5000, 5000]);
  });

  it("waits longer after slow_down, using the interval GitHub gives", async () => {
    const s = scripted([{ error: "slow_down", interval: 10 }, { access_token: "gho_x" }]);
    await pollForToken(s.post, code, { clientId: "c", sleep: s.sleep });
    expect(s.waits).toEqual([5000, 10000]);
  });

  it("stops on a declined or expired code", async () => {
    const denied = scripted([{ error: "access_denied" }]);
    await expect(pollForToken(denied.post, code, { clientId: "c", sleep: denied.sleep })).rejects.toMatchObject({ code: "denied" });
    const expired = scripted([{ error: "expired_token" }]);
    await expect(pollForToken(expired.post, code, { clientId: "c", sleep: expired.sleep })).rejects.toBeInstanceOf(DeviceFlowError);
  });

  it("gives up once the code's lifetime has passed, and when cancelled", async () => {
    const s = scripted(Array.from({ length: 50 }, () => ({ error: "authorization_pending" })));
    await expect(pollForToken(s.post, { ...code, expiresIn: 12 }, { clientId: "c", sleep: s.sleep })).rejects.toMatchObject({
      code: "expired",
    });
    const c = scripted([{ error: "authorization_pending" }]);
    await expect(pollForToken(c.post, code, { clientId: "c", sleep: c.sleep, cancelled: () => true })).rejects.toMatchObject({
      code: "denied",
    });
    expect(c.posts).toHaveLength(0);
  });
});
