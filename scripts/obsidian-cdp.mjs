// Drive a running Obsidian over CDP (see docs/visual-testing.md).
//   node scripts/obsidian-cdp.mjs '<js expression>' [screenshot.png]
// The expression runs in the Obsidian window (so `app` is available) and may be async;
// its value is printed as JSON. Pass "-" as the expression to only take a screenshot.
import fs from "fs";
const [,, expr, out] = process.argv;
const pages = await (await fetch("http://localhost:9222/json")).json();
const ws = new WebSocket(pages.find(p=>p.type==="page").webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}))});
if(expr&&expr!=="-"){const r=await send("Runtime.evaluate",{expression:expr,awaitPromise:true,returnByValue:true});console.log(JSON.stringify(r.result.result.value ?? r.result));}
if(out){const r=await send("Page.captureScreenshot",{format:"png"});fs.writeFileSync(out,Buffer.from(r.result.data,"base64"));}
ws.close();
