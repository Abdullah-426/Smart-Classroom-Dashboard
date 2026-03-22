const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const flowPath = path.join(root, "all_flows_edit.json");
let escaped = fs.readFileSync(path.join(__dirname, "groq-func-escaped.txt"), "utf8").trim();
if (escaped.charCodeAt(0) === 0xfeff) escaped = escaped.slice(1);

const flow = JSON.parse(fs.readFileSync(flowPath, "utf8"));
const n = flow.find((x) => x.id === "f8e9d0c1b2a38495");
if (!n) throw new Error("Groq native node missing");
n.func = JSON.parse(escaped);
n.libs = [{ var: "https", module: "https" }];

fs.writeFileSync(flowPath, JSON.stringify(flow, null, 4), "utf8");
console.log("Updated f8e9d0c1b2a38495: async https + libs");
