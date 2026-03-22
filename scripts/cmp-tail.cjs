const f = require("../all_flows_edit.json");
const p = f.find((x) => x.id === "c4b7e19a2d3658f0");
const t = p.func.slice(p.func.indexOf("msg.skipGroq = false"));
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
        { role: "user", content: "Latest classroom state (JSON):\n" + userBlock }
    ],
    temperature: 0.35,
    max_tokens: 450
});

return msg;`;
console.log("eq", t === oldTail);
if (t !== oldTail) {
  for (let i = 0; i < Math.max(t.length, oldTail.length); i++) {
    if (t[i] !== oldTail[i]) {
      console.log("diff at", i, JSON.stringify(t.slice(i, i + 60)));
      console.log("expected", JSON.stringify(oldTail.slice(i, i + 60)));
      break;
    }
  }
}
