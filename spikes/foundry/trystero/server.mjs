// THROWAWAY: serves dist/ and collects peer logs on POST /log.
import http from "node:http"; import { readFileSync, appendFileSync, existsSync } from "node:fs";
const logs = [];
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.url === "/log" && req.method === "POST") {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { logs.push(b); appendFileSync("dist/peers.log", b + "\n"); res.end("ok"); }); return;
  }
  if (req.url === "/logs") return res.end(logs.join("\n"));
  const f = "dist" + (req.url.split("?")[0] === "/" ? "/page.html" : req.url.split("?")[0]);
  if (existsSync(f)) { res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : "text/javascript" }); return res.end(readFileSync(f)); }
  res.writeHead(404); res.end();
}).listen(8765, "127.0.0.1", () => console.log("listening 8765"));
