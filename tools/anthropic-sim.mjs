/**
 * Simulador local da API de mensagens da Anthropic (só para testar o Analista IA sem chave).
 * Comportamento: na 1ª rodada pede a ferramenta indicada pela pergunta; na 2ª responde em texto (streaming SSE)
 * citando números do resultado. Se a pergunta contém "INVENTE", escreve um número fora dos dados (testa o guarda-corpo).
 *   ANTHROPIC_BASE_URL=http://localhost:3998 node tools/anthropic-sim.mjs 3998
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 3998);

function pickTool(text) {
  const t = text.toLowerCase();
  if (/sinais|sinal|modelo/.test(t)) return { name: "sinais_modelo", input: {} };
  if (/padr[õo]es|scanner/.test(t)) return { name: "scanner_padroes", input: { tf: "4h" } };
  if (/taxa de acerto|acerto/.test(t)) return { name: "taxa_acerto", input: { tf: "4h" } };
  if (/mercado|dominância|medo/.test(t)) return { name: "panorama_mercado", input: {} };
  if (/cota[çc][ãa]o|pre[çc]o de/.test(t)) return { name: "cotacao", input: { symbols: ["BTC", "ETH"] } };
  if (/alerta/.test(t)) return { name: "contexto_ativo", input: { symbol: "BTC" } };
  return { name: "contexto_ativo", input: { symbol: "BTC" } };
}

function firstNumbers(obj, out = [], depth = 0) {
  if (out.length >= 3 || depth > 6) return out;
  if (typeof obj === "number" && Number.isFinite(obj)) out.push(obj);
  else if (Array.isArray(obj)) for (const x of obj) firstNumbers(x, out, depth + 1);
  else if (obj && typeof obj === "object") for (const x of Object.values(obj)) firstNumbers(x, out, depth + 1);
  return out;
}

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}

createServer((req, res) => {
  if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) {
    res.statusCode = 404;
    return res.end("{}");
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = JSON.parse(body);
    const msgs = j.messages;
    const lastUser = msgs[msgs.length - 1];
    const userText = msgs.filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content).pop() ?? "";
    const toolResult = Array.isArray(lastUser.content) ? lastUser.content.find((b) => b.type === "tool_result") : null;
    const usage = { input_tokens: 100, output_tokens: 50 };
    // rodada de correção do guarda-corpo (última mensagem do usuário pede reescrita)
    if (typeof lastUser.content === "string" && /Reescreva a resposta inteira/.test(lastUser.content)) {
      const text = "Resposta reescrita sem o número inventado. Dado não disponível para o item removido.";
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ id: "msg_fix", type: "message", role: "assistant", model: j.model, content: [{ type: "text", text }], stop_reason: "end_turn", usage }));
    }
    if (!toolResult) {
      const tool = /alerta/i.test(userText) && msgs.length > 1 ? { name: "propor_alerta", input: { symbol: "BTC", kind: "price_above", threshold: 1, note: "teste" } } : pickTool(userText);
      const tu = { type: "tool_use", id: `tu_${Date.now()}`, name: tool.name, input: tool.input };
      return sse(res, [
        ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: j.model, content: [], stop_reason: null, stop_sequence: null, usage } }],
        ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: tu.id, name: tu.name, input: {} } }],
        ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(tu.input) } }],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 20 } }],
        ["message_stop", { type: "message_stop" }],
      ]);
    }
    let parsed = {};
    try {
      parsed = JSON.parse(toolResult.content);
    } catch {
      parsed = {};
    }
    const nums = firstNumbers(parsed);
    const fake = /INVENTE/.test(userText) ? " Probabilidade estimada de 73.9%." : "";
    const err = parsed && parsed.error ? `A ferramenta falhou: ${parsed.error}.` : "";
    const text = err || `**Leitura (fonte: ${toolResult.tool_use_id.startsWith("tu_") ? "ferramenta do app" : "?"})**\n\n- Primeiro valor: ${nums[0] ?? "n/d"}\n- Segundo valor: ${nums[1] ?? "n/d"}\n- Terceiro valor: ${nums[2] ?? "n/d"}\n\nSem recomendação de compra ou venda.${fake}`;
    const parts = text.match(/[\s\S]{1,40}/g) ?? [text];
    return sse(res, [
      ["message_start", { type: "message_start", message: { id: "msg_2", type: "message", role: "assistant", model: j.model, content: [], stop_reason: null, stop_sequence: null, usage } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ...parts.map((p) => ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p } }]),
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 80 } }],
      ["message_stop", { type: "message_stop" }],
    ]);
  });
}).listen(port, () => console.log(`anthropic-sim em http://localhost:${port}`));
