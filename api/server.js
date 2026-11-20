import http from "node:http";

const PORT = Number(process.env.PORT || 10000);
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";
const ALLOWED_ORIGINS = new Set([
  "https://the-court-82wx.onrender.com",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

const headers = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://the-court-82wx.onrender.com",
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
});

function send(res, status, data, origin) {
  res.writeHead(status, headers(origin));
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers(origin));
    return res.end();
  }
  if (req.method === "GET" && req.url === "/api/health") {
    return send(res, 200, { ok: true, provider: "Claude", configured: Boolean(API_KEY) }, origin);
  }
  if (req.method !== "POST" || req.url !== "/api/ask") {
    return send(res, 404, { error: "Not found" }, origin);
  }
  if (!API_KEY) {
    return send(res, 503, { error: "Claude APIキーが未設定です。Renderの環境変数 ANTHROPIC_API_KEY を設定してください。" }, origin);
  }

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 24000) return send(res, 413, { error: "質問内容が長すぎます。" }, origin);
  }

  try {
    const input = JSON.parse(raw || "{}");
    const question = String(input.question || "").trim().slice(0, 1500);
    if (!question) return send(res, 400, { error: "質問を入力してください。" }, origin);

    const context = {
      caseName: String(input.caseName || "").slice(0, 120),
      allegation: String(input.allegation || "").slice(0, 1200),
      defendant: String(input.defendant || "").slice(0, 100),
      prosecutor: String(input.prosecutor || "").slice(0, 100),
      defense: String(input.defense || "").slice(0, 100),
      witness: String(input.witness || "").slice(0, 1200),
      evidence: Array.isArray(input.evidence) ? input.evidence.slice(0, 12).map(x => String(x).slice(0, 500)) : [],
      transcript: Array.isArray(input.transcript) ? input.transcript.slice(-12).map(x => String(x).slice(0, 500)) : [],
      target: String(input.target || "法廷関係者").slice(0, 50)
    };

    const system = `あなたは日本の刑事裁判を題材にしたゲーム「THE COURT」の法廷応答AIです。
裁判官からの質問に、指定された質問対象（被告人・証人・検察官・弁護人・裁判所書記官等）の立場で、事件記録と会話の文脈に沿って自然な日本語で答えてください。
必ず次を守ること：
- 役割を崩さず、質問に直接答える。知らないことは「分かりません」「記憶が曖昧です」と答える。
- 提示されていない事実、証拠、供述、条文を捏造しない。設定が不明なら不明と明示する。
- 被告人や証人は一人称で答え、検察官・弁護人は法律家として主張と根拠を分けて説明する。
- 法律に触れる場合、一般的な説明に留め、現行法の確認が必要と伝える。ゲーム上の回答であり法的助言ではない。
- 80〜220字程度。質問が複雑なら必要な範囲で詳しく答える。`;

    const userPrompt = `【事件記録】\n${JSON.stringify(context, null, 2)}\n\n【裁判官の質問】\n${question}\n\n質問対象の立場で回答してください。`;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: userPrompt }]
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      return send(res, 502, { error: payload?.error?.message || "Claude APIから回答を取得できませんでした。" }, origin);
    }
    const answer = (payload.content || []).filter(x => x.type === "text").map(x => x.text).join("\n").trim();
    return send(res, 200, { answer, model: MODEL }, origin);
  } catch (error) {
    return send(res, 500, { error: "回答処理に失敗しました。質問を短くして再度お試しください。" }, origin);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`THE COURT Claude API listening on ${PORT}`);
});
