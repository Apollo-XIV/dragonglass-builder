/**
 * GitHub's device flow, for signing in once and reading every private repo the account can.
 * It needs only a client id, so nothing secret ships in the plugin, and it works on mobile
 * because there is no redirect to catch. The HTTP call is passed in so the flow is testable.
 */

/**
 * The client id of Dragonglass's GitHub OAuth App (Device Flow enabled). Empty until the
 * app is registered; sign-in reports that rather than failing at GitHub.
 */
export const GITHUB_CLIENT_ID = "";

/**
 * `repo` is the only scope that reads private repositories, and it is read *and write* on
 * every one the account can reach. The sign-in copy says so.
 */
export const GITHUB_OAUTH_SCOPE = "repo";

export interface DeviceCode {
  deviceCode: string;
  /** What the user types at `verificationUri`. */
  userCode: string;
  verificationUri: string;
  /** Seconds to wait between polls. */
  interval: number;
  /** Seconds until the code stops working. */
  expiresIn: number;
}

/** POSTs a form to GitHub and returns the decoded JSON. `requestUrl` in the plugin, a stub in tests. */
export type PostForm = (url: string, form: Record<string, string>) => Promise<Record<string, unknown>>;

export class DeviceFlowError extends Error {
  constructor(
    message: string,
    readonly code: "expired" | "denied" | "unconfigured" | "failed",
  ) {
    super(message);
  }
}

export async function requestDeviceCode(post: PostForm, clientId = GITHUB_CLIENT_ID): Promise<DeviceCode> {
  if (!clientId) throw new DeviceFlowError("GitHub sign-in isn't set up in this build of the plugin", "unconfigured");
  const body = await post("https://github.com/login/device/code", { client_id: clientId, scope: GITHUB_OAUTH_SCOPE });
  if (typeof body.device_code !== "string" || typeof body.user_code !== "string")
    throw new DeviceFlowError(describeError(body) ?? "GitHub didn't return a sign-in code", "failed");
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: typeof body.verification_uri === "string" ? body.verification_uri : "https://github.com/login/device",
    interval: typeof body.interval === "number" ? body.interval : 5,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : 900,
  };
}

export interface PollOptions {
  clientId?: string;
  /** Resolves after `ms`; replaced in tests so polling doesn't take real time. */
  sleep?: (ms: number) => Promise<void>;
  /** Stops polling when it returns true, for a cancelled dialog. */
  cancelled?: () => boolean;
}

/** Polls until the user approves, then returns the access token. */
export async function pollForToken(post: PostForm, code: DeviceCode, options: PollOptions = {}): Promise<string> {
  const clientId = options.clientId ?? GITHUB_CLIENT_ID;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let interval = code.interval;
  let waited = 0;
  for (;;) {
    await sleep(interval * 1000);
    waited += interval;
    if (options.cancelled?.()) throw new DeviceFlowError("Sign-in cancelled", "denied");
    const body = await post("https://github.com/login/oauth/access_token", {
      client_id: clientId,
      device_code: code.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (typeof body.access_token === "string" && body.access_token) return body.access_token;
    switch (body.error) {
      case "authorization_pending":
        break;
      // GitHub asks for a longer gap, and gives the new one.
      case "slow_down":
        interval = typeof body.interval === "number" ? body.interval : interval + 5;
        break;
      case "expired_token":
        throw new DeviceFlowError("The code expired before it was entered. Start again.", "expired");
      case "access_denied":
        throw new DeviceFlowError("Sign-in was declined on GitHub.", "denied");
      default:
        throw new DeviceFlowError(describeError(body) ?? "GitHub sign-in failed", "failed");
    }
    if (waited >= code.expiresIn) throw new DeviceFlowError("The code expired before it was entered. Start again.", "expired");
  }
}

function describeError(body: Record<string, unknown>): string | undefined {
  if (typeof body.error_description === "string") return body.error_description;
  if (typeof body.error === "string") return body.error;
  return undefined;
}
