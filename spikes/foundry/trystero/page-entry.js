import { run } from "./pair.js";
const q = new URLSearchParams(location.search);
run({ rtc: q.get("rtc") ? JSON.parse(q.get("rtc")) : undefined, role: q.get("role"), key: q.get("key"), who: q.get("who") || "page", waitMs: Number(q.get("waitMs") || 45000),
  ice: q.get("ice") ? JSON.parse(q.get("ice")) : undefined, relays: q.get("relays") ? JSON.parse(q.get("relays")) : undefined });
