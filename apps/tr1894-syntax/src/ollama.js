export const DEFAULT_MODEL = "qwen2.5:14b";
const defaultBaseUrl = "http://127.0.0.1:11434";

export function baseUrl() {
  return String(process.env.LBF_OLLAMA_BASE_URL || process.env.OLLAMA_HOST || defaultBaseUrl).replace(/\/+$/u, "");
}

export async function listModels() {
  let response;
  try {
    response = await fetch(`${baseUrl()}/api/tags`, { signal: AbortSignal.timeout(2500) });
  } catch {
    const error = new Error(`Ollama is not reachable at ${baseUrl()}. Start it, then refresh the model list.`);
    error.code = "OLLAMA_UNREACHABLE";
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Ollama returned ${response.status}.`);
  return (Array.isArray(body.models) ? body.models : []).map(item => String(item.model || item.name || "")).filter(Boolean);
}

function responseFormat() {
  return {
    type: "object",
    properties: {
      clauses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            local_id: { type: "string" },
            source_ref: { type: "string" },
            clause_type: { type: "string" },
            rule: { type: "string" },
            children: { type: "array", items: { type: "string" } },
            rationale: { type: "string" }
          },
          required: ["local_id", "source_ref", "clause_type", "rule", "children", "rationale"]
        }
      },
      cautions: { type: "array", items: { type: "string" } }
    },
    required: ["clauses", "cautions"]
  };
}

export async function suggestClauses({ model, source }) {
  const selectedModel = String(model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const prompt = `You are assisting a human researcher who is manually building a TR1894 Greek syntax fixture.

The local Scrivener 1894 TR terminals below are immutable. Robinson morphology is only supporting evidence. Do not silently substitute a critical edition, add terminals, change token order, or claim this is a finished corpus.

Suggest a nested clause plan. Every child must be either an exact listed terminal ID or a local clause ID. Use a short local clause ID such as c001. Use each terminal at most once. Leave difficult relationships in cautions rather than guessing.

Return only JSON matching the supplied schema.

${source}`;
  let response;
  try {
    response = await fetch(`${baseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: selectedModel,
        stream: false,
        format: responseFormat(),
        options: { temperature: 0, num_ctx: 16384 },
        messages: [
          { role: "system", content: "You provide reviewable syntax suggestions only; a human decides every clause boundary." },
          { role: "user", content: prompt }
        ]
      })
    });
  } catch {
    const error = new Error(`Ollama stopped responding at ${baseUrl()}.`);
    error.code = "OLLAMA_UNREACHABLE";
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Ollama request failed (${response.status}).`);
  try {
    return JSON.parse(String(body.message?.content || ""));
  } catch {
    throw new Error("The model did not return valid structured JSON. Try the request again or choose another model.");
  }
}
