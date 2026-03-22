const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const flowPath = path.join(root, "all_flows_edit.json");
const escapedPath = path.join(__dirname, "groq-func-escaped.txt");

let escaped = fs.readFileSync(escapedPath, "utf8").trim();
if (escaped.charCodeAt(0) === 0xfeff) escaped = escaped.slice(1);
const groqFuncSource = JSON.parse(escaped);

const oldTail = `msg.skipGroq = false;
// Chat Completions is more reliable from Docker than beta /v1/responses (which often stalls).
msg.requestTimeout = 32000;
msg.method = "POST";
msg.url = "https://api.groq.com/openai/v1/chat/completions";
msg.headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + apiKey
};
msg.payload = JSON.stringify({
    model: model,
    messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Latest classroom state (JSON):\\n" + userBlock }
    ],
    temperature: 0.35,
    max_tokens: 450
});

return msg;`;

const newTail = `msg.skipGroq = false;
msg._groqChatPayload = {
    model: model,
    messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Latest classroom state (JSON):\\n" + userBlock }
    ],
    temperature: 0.35,
    max_tokens: 450
};

return msg;`;

const flow = JSON.parse(fs.readFileSync(flowPath, "utf8"));

const prep = flow.find((n) => n.id === "c4b7e19a2d3658f0");
if (!prep) throw new Error("Prepare node missing");

if (prep.func.includes("_groqChatPayload")) {
  console.log("Prepare already has _groqChatPayload; skipping tail replace.");
} else if (!prep.func.includes(oldTail)) {
  console.error("Prepare tail not found — flow may have been edited manually.");
  process.exit(1);
} else {
  prep.func = prep.func.replace(oldTail, newTail);
}

const sw = flow.find((n) => n.id === "a9c8e7d6b5a40301");
if (!sw) throw new Error("switch missing");
sw.wires[1] = ["f8e9d0c1b2a38495"];

const filtered = flow.filter((n) => n.id !== "c7d6e5f4a3b20102" && n.id !== "d6e5f4a3b2c10203");

const newNode = {
  id: "f8e9d0c1b2a38495",
  type: "function",
  z: "51ea9c70bb53699f",
  name: "API AI Groq native https",
  func: groqFuncSource,
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 1100,
  y: 1920,
  wires: [["e5f4a3b2c1d00204"]],
};

if (filtered.some((n) => n.id === "f8e9d0c1b2a38495")) {
  const n = filtered.find((x) => x.id === "f8e9d0c1b2a38495");
  n.func = groqFuncSource;
  n.wires = [["e5f4a3b2c1d00204"]];
} else {
  const distIdx = filtered.findIndex((n) => n.id === "e5f4a3b2c1d00204");
  if (distIdx < 0) throw new Error("distribute missing");
  filtered.splice(distIdx, 0, newNode);
}

fs.writeFileSync(flowPath, JSON.stringify(filtered, null, 4), "utf8");
console.log("OK:", flowPath, "nodes:", filtered.length);
