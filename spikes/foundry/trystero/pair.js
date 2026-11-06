// THROWAWAY (spike/foundry-integration). Smallest possible Trystero pairing + RPC.
// `strategy` is an esbuild alias, so one source builds against nostr, mqtt or torrent.
import { joinRoom, selfId } from "strategy";

const LOG = "http://127.0.0.1:8765/log";
const t0 = Date.now();
export function makeLogger(who) {
  return (msg, extra) => {
    const line = { who, t: Date.now() - t0, msg, ...(extra ? { extra } : {}) };
    try { console.log(JSON.stringify(line)); } catch {}
    fetch(LOG, { method: "POST", body: JSON.stringify(line) }).catch(() => {});
  };
}

/** role "vault" answers listCharacters/getCharacter; role "foundry" asks. */
export async function run({ role, key, who, ice, rtc, relays, waitMs = 45000 }) {
  const log = makeLogger(who);
  log("start", { role, selfId, ua: typeof navigator !== "undefined" ? navigator.userAgent : "node" });
  const config = { appId: "dragonglass-spike-0001", password: key };
  if (ice || rtc) config.rtcConfig = { ...(ice ? { iceServers: ice } : {}), ...(rtc ?? {}) };
  if (relays) config.relayConfig = { urls: relays };
  const room = joinRoom(config, "pair-" + key.slice(0, 8), {
    onJoinError: (d) => log("onJoinError", d),
  });
  log("joinRoom returned (signalling is async)");
  const rpc = room.makeAction("rpc", {
    kind: "request",
    onRequest: (req) => {
      if (req.method === "listCharacters") return [{ id: "ilsa", name: "Ilsa" }];
      if (req.method === "getCharacter") return { id: req.id, note: "export document goes here" };
      throw new Error("unknown method");
    },
  });
  return await new Promise((done) => {
    const timer = setTimeout(() => { log("TIMEOUT: no peer", { waitMs }); done("timeout"); }, waitMs);
    room.onPeerJoin = async (peerId) => {
      log("peerJoin", { peerId, t: Date.now() - t0 });
      if (role === "foundry") {
        try {
          const t1 = Date.now();
          const list = await rpc.request({ method: "listCharacters" }, { target: peerId, timeoutMs: 8000 });
          log("rpc listCharacters ok", { list, ms: Date.now() - t1 });
          clearTimeout(timer); done("ok");
        } catch (e) { log("rpc failed", { err: String(e) }); }
      }
    };
    room.onPeerLeave = (peerId) => log("peerLeave", { peerId });
    if (role === "vault") { const orig = room.onPeerJoin; room.onPeerJoin = (p) => { clearTimeout(timer); orig(p); }; }
  });
}
