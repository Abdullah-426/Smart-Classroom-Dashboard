const func = `const isoNow = () => new Date().toISOString();
const fallback = msg._fallbackSummary || "Unable to generate AI summary.";
const usedModel = msg._usedModel || "openai/gpt-oss-20b";

function stripQuotes(k) {
    let key = typeof k === "string" ? k.trim() : "";
    if (key.length >= 2 && ((key.charCodeAt(0) === 34 && key.charCodeAt(key.length - 1) === 34) || (key.charCodeAt(0) === 39 && key.charCodeAt(key.length - 1) === 39))) {
        key = key.slice(1, -1).trim();
    }
    return key;
}

function failPayload() {
    return {
        ok: true,
        summary: fallback,
        generatedAt: isoNow(),
        model: "fallback",
        source: "local"
    };
}

function okPayload(text) {
    return {
        ok: true,
        summary: text,
        generatedAt: isoNow(),
        model: usedModel,
        source: "groq"
    };
}

function extractText(raw) {
    if (!raw || typeof raw !== "object") return "";
    const ch = raw.choices;
    if (Array.isArray(ch) && ch[0] && ch[0].message && typeof ch[0].message.content === "string") {
        return ch[0].message.content.trim();
    }
    if (typeof raw.output_text === "string" && raw.output_text.trim()) return raw.output_text.trim();
    return "";
}

const apiKey = stripQuotes(String(env.get("GROQ_API_KEY") || "").trim());
const chatPayload = msg._groqChatPayload;

if (!chatPayload || !apiKey) {
    msg.payload = failPayload();
    return msg;
}

const bodyStr = JSON.stringify(chatPayload);
const opts = {
    hostname: "api.groq.com",
    port: 443,
    path: "/openai/v1/chat/completions",
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "Content-Length": Buffer.byteLength(bodyStr, "utf8")
    }
};

try {
    await new Promise((resolve) => {
        let settled = false;
        function settle() {
            if (settled) return;
            settled = true;
            resolve();
        }
        const req = https.request(opts, (res) => {
            req.setTimeout(0);
            let chunks = "";
            res.setEncoding("utf8");
            res.on("data", (c) => { chunks += c; });
            res.on("end", () => {
                let raw = null;
                try {
                    raw = JSON.parse(chunks);
                } catch (e) {
                    raw = null;
                }
                const st = res.statusCode || 0;
                const text = st >= 200 && st < 300 ? extractText(raw) : "";
                msg.payload = text ? okPayload(text) : failPayload();
                settle();
            });
        });
        req.setTimeout(26000, () => {
            req.destroy();
            if (!settled) {
                msg.payload = failPayload();
                settle();
            }
        });
        req.on("error", () => {
            if (!settled) {
                msg.payload = failPayload();
                settle();
            }
        });
        req.write(bodyStr);
        req.end();
    });
} catch (e) {
    msg.payload = failPayload();
}

return msg;`;

process.stdout.write(JSON.stringify(func));
