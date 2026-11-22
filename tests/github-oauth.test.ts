import { describe, expect, it } from "vitest";
import { DeviceFlowError, pollForToken, requestDeviceCode, type DeviceCode, type PostForm } from "../src/obsidian/github-oauth";

const code: DeviceCode = {
  deviceCode: "dev",
  userCode: "ABCD-1234",
  verificationUri: "https://github.com/login/device",
  interval: 5,
  expiresIn: 900,
};

/**
 * Answers each poll from `replies`, in order — an `Error` is a request that never reached GitHub —
 * and records how long it was asked to wait. Sleeping moves a fake clock on by the wait, or by
 * `woken` instead when that is set, for a sleep cut short by coming back to the app.
 */
function scripted(replies: (Record<string, unknown> | Error)[]) {
  const waits: number[] = [];
  const posts: { url: string; form: Record<string, string> }[] = [];
  let time = 0;
  const post: PostForm = async (url, form) => {
    posts.push({ url, form });
    const reply = replies.shift() ?? {};
    if (reply instanceof Error) throw reply;
    return reply;
  };
  const s = {
    post,
    waits,
    posts,
    woken: undefined as number | undefined,
    now: () => time,
    sleep: async (ms: number) => {
      waits.push(ms);
      time += s.woken ?? ms;
    },
  };
  return s;
}

const offline = () => new Error("net::ERR_INTERNET_DISCONNECTED");

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
    await expect(pollForToken(s.post, code, { clientId: "c", sleep: s.sleep, now: s.now })).resolves.toBe("gho_x");
    expect(s.waits).toEqual([5000, 5000, 5000]);
  });

  it("waits longer after slow_down, using the interval GitHub gives", async () => {
    const s = scripted([{ error: "slow_down", interval: 10 }, { access_token: "gho_x" }]);
    await pollForToken(s.post, code, { clientId: "c", sleep: s.sleep, now: s.now });
    expect(s.waits).toEqual([5000, 10000]);
  });

  it("stops on a declined or expired code", async () => {
    const denied = scripted([{ error: "access_denied" }]);
    await expect(pollForToken(denied.post, code, { clientId: "c", sleep: denied.sleep, now: denied.now })).rejects.toMatchObject({ code: "denied" });
    const expired = scripted([{ error: "expired_token" }]);
    await expect(pollForToken(expired.post, code, { clientId: "c", sleep: expired.sleep, now: expired.now })).rejects.toBeInstanceOf(DeviceFlowError);
  });

  it("gives up once the code's lifetime has passed, and when cancelled", async () => {
    const s = scripted(Array.from({ length: 50 }, () => ({ error: "authorization_pending" })));
    await expect(pollForToken(s.post, { ...code, expiresIn: 12 }, { clientId: "c", sleep: s.sleep, now: s.now })).rejects.toMatchObject({
      code: "expired",
    });
    const c = scripted([{ error: "authorization_pending" }]);
    await expect(pollForToken(c.post, code, { clientId: "c", sleep: c.sleep, now: c.now, cancelled: () => true })).rejects.toMatchObject({
      code: "denied",
    });
    expect(c.posts).toHaveLength(0);
  });

  it("keeps polling through requests that never reach GitHub, and says so", async () => {
    const s = scripted([offline(), offline(), { error: "authorization_pending" }, { access_token: "gho_x" }]);
    const reachable: boolean[] = [];
    const token = pollForToken(s.post, code, { clientId: "c", sleep: s.sleep, now: s.now, onReachable: (r) => reachable.push(r) });
    await expect(token).resolves.toBe("gho_x");
    expect(reachable).toEqual([false, false, true, true]);
  });

  it("still obeys GitHub's own answers after being unreachable", async () => {
    const denied = scripted([offline(), { error: "access_denied" }]);
    await expect(pollForToken(denied.post, code, { clientId: "c", sleep: denied.sleep, now: denied.now })).rejects.toMatchObject({
      code: "denied",
    });
    const slow = scripted([offline(), { error: "slow_down", interval: 10 }, offline(), { access_token: "gho_x" }]);
    await pollForToken(slow.post, code, { clientId: "c", sleep: slow.sleep, now: slow.now });
    expect(slow.waits).toEqual([5000, 5000, 10000, 10000]);
    const odd = scripted([offline(), { error: "incorrect_client_credentials", error_description: "Bad client" }]);
    await expect(pollForToken(odd.post, code, { clientId: "c", sleep: odd.sleep, now: odd.now })).rejects.toMatchObject({
      code: "failed",
      message: "Bad client",
    });
  });

  it("measures the code's lifetime on the clock, not in polls, so a long absence still expires it", async () => {
    const s = scripted([offline(), { access_token: "gho_x" }]);
    // The app was in the background for twenty minutes: one stalled sleep, one failed poll.
    s.woken = 20 * 60 * 1000;
    await expect(pollForToken(s.post, code, { clientId: "c", sleep: s.sleep, now: s.now })).rejects.toMatchObject({
      code: "expired",
    });
    expect(s.posts).toHaveLength(1);
  });

  it("polls at once when woken after a failed poll, but keeps the interval after an answered one", async () => {
    const afterFail = scripted([offline(), { access_token: "gho_x" }]);
    afterFail.woken = 1000;
    await pollForToken(afterFail.post, code, { clientId: "c", sleep: afterFail.sleep, now: afterFail.now });
    // The first wait is woken early too, so it is topped up before the first poll.
    expect(afterFail.waits).toEqual([5000, 4000, 3000, 2000, 1000, 5000]);
    expect(afterFail.posts).toHaveLength(2);

    const afterAnswer = scripted([{ error: "authorization_pending" }, { access_token: "gho_x" }]);
    afterAnswer.woken = 3000;
    await pollForToken(afterAnswer.post, code, { clientId: "c", sleep: afterAnswer.sleep, now: afterAnswer.now });
    expect(afterAnswer.waits).toEqual([5000, 2000, 5000, 2000]);
  });
});
