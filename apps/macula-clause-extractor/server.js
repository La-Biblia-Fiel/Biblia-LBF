import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPassage } from "./src/extractor.js";
import { BOOKS } from "./src/books.js";
import { buildPropositions } from "./src/propositions.js";
import { buildJevState, createReferentResolver } from "./src/jev-state.js";
import { loadSavedJevResults } from "./src/jev-results.js";
import { buildIsaiahPassageRelationships, validateIsaiahPassageRelationships } from "./src/passage-relationships.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
function send(response, status, body, type = "text/plain; charset=utf-8") { response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); response.end(body); }
async function candidateResults() {
  const directory = join(appRoot, "var", "openrouter-jev-passage-candidate-v0.1.0");
  const index = JSON.parse(await readFile(join(directory, "index.json"), "utf8"));
  const attempt = index.attempts.filter(item => item.status === "succeeded").at(-1);
  if (!attempt) return { status: "missing_saved_result", human_evidence_review_required: true, units: [] };
  const record = JSON.parse(await readFile(join(directory, attempt.file), "utf8"));
  const analysis = buildPropositions(await loadPassage(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 4, lastVerse: 6 }));
  const answer = (id, suffix) => record.raw_response.answers[`${id}:${suffix}`] || null;
  const compact = result => result ? { choice: result.choice, probability: result.probabilities?.[result.choice] ?? null, probabilities: result.probabilities } : null;
  return {
    status: "saved_model_judgment", label: "Predictive prophetic-statement candidate assessment — awaiting human evidence review",
    boundary: "These are Jev choice judgments, not canonical facts or final theological classifications. No supporting citations or rationale were returned by the model.",
    source_context: record.exact_api_request.state.source_window,
    model: { requested: record.requested_model, served: record.served_model, provider: record.provider, request_fingerprint: record.request_fingerprint, usage: record.usage, elapsed_ms: record.elapsed_ms, validation: record.response_validation },
    units: analysis.propositions.map(proposition => ({
      proposition_id: proposition.proposition_id, reference: proposition.reference, statement: proposition.source.text,
      scope: proposition.complements.length ? "Governing assertion; its descriptions remain content inside the speakers’ evaluation." : "Governing assertion.",
      candidate: compact(answer(proposition.proposition_id, "candidate_assessment")), depiction: compact(answer(proposition.proposition_id, "depiction_mode")), communicative_function: compact(answer(proposition.proposition_id, "communicative_function")),
      speaker_time: compact(answer(proposition.proposition_id, "time_relative_to_represented_speaker")), communication_time: compact(answer(proposition.proposition_id, "time_relative_to_communication_setting"))
    }))
  };
}
async function oneKingsVerificationResults() {
  const directory = join(appRoot, "var", "openrouter-jev-1ki13-verification-v0.1.0");
  let index;
  try { index = JSON.parse(await readFile(join(directory, "index.json"), "utf8")); } catch (error) {
    if (error.code === "ENOENT") return { status: "missing_saved_result", label: "1 Kings 13 verification — no saved result", cases: [] };
    throw error;
  }
  const attempt = index.attempts.filter(item => item.status === "succeeded").at(-1);
  if (!attempt) return { status: "missing_saved_result", label: "1 Kings 13 verification — no successful saved result", cases: [] };
  const record = JSON.parse(await readFile(join(directory, attempt.file), "utf8"));
  const compact = id => {
    const result = record.raw_response?.answers?.[`${id}:candidate_assessment`] || null;
    const probabilities = result?.probabilities || null;
    const choice = result?.choice || null;
    const alternative = probabilities ? Object.entries(probabilities).filter(([name]) => name !== choice).sort(([, left], [, right]) => right - left)[0] || null : null;
    return { case_id: id, expected: record.local_verification.expected_outcomes[id], observed: choice, passed: choice === record.local_verification.expected_outcomes[id], probabilities, reported_confidence: result?.confidence ?? null, substantial_alternative: alternative && alternative[1] >= .2 ? { choice: alternative[0], probability: alternative[1] } : null, case_evidence: record.exact_api_request.state.cases[id] };
  };
  return {
    status: "saved_model_judgment", label: "1 Kings 13:1–3 basic detection verification — saved Jev judgments",
    boundary: "Source evidence and local expectations are distinct from Jev’s model judgments. This two-case control does not classify Isaiah 53 or establish whole-Bible accuracy.",
    source_context: record.exact_api_request.state.source_window,
    model: { requested: record.requested_model, served: record.served_model, provider: record.provider, request_fingerprint: record.request_fingerprint, usage: record.usage, elapsed_ms: record.elapsed_ms, validation: record.response_validation },
    cases: [compact("announcement_1ki_13_2_3"), compact("narrative_control_1ki_13_1")]
  };
}
async function passageRelationships() {
  const graph = await buildIsaiahPassageRelationships(repoRoot);
  const response = { ...graph, validation: validateIsaiahPassageRelationships(graph), relationship_assessment: { status: "missing_saved_result", judgments: {} } };
  const directory = join(appRoot, "var", "openrouter-jev-passage-relationships-v0.1.0");
  let index;
  try { index = JSON.parse(await readFile(join(directory, "index.json"), "utf8")); } catch (error) {
    if (error.code === "ENOENT") return response;
    throw error;
  }
  const attempt = index.attempts.filter(item => item.status === "succeeded").at(-1);
  if (!attempt) return response;
  const record = JSON.parse(await readFile(join(directory, attempt.file), "utf8"));
  const expectedChoice = type => ({ proposed_establishes_predictive_announcement: "establishes_announcement_anchor", proposed_contributes_to_announcement: "contributes_to_announcement_anchor", surrounding_or_other_content: "surrounding_or_other_content", unresolved_relationship: "relationship_underdetermined" })[type];
  response.relationship_assessment = {
    status: "saved_model_judgment",
    boundary: "Jev distributions are model judgments, not canonical facts or supporting rationales. They assess the local hypotheses but do not overwrite them.",
    model: { requested: record.requested_model, served: record.served_model, provider: record.provider, request_fingerprint: record.request_fingerprint, usage: record.usage, elapsed_ms: record.elapsed_ms, validation: record.response_validation },
    judgments: Object.fromEntries(graph.relationships.map(item => {
      const id = `relationship:${item.source.proposition_id}:${item.relationship_type}:assessment`, result = record.raw_response?.answers?.[id] || null, proposed = expectedChoice(item.relationship_type);
      return [id, result ? { selected_answer: result.choice, probabilities: result.probabilities, reported_confidence: result.confidence, agrees_with_local_proposal: result.choice === proposed } : null];
    }))
  };
  return response;
}
createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  try {
    if (url.pathname === "/api/books") return send(response, 200, JSON.stringify(BOOKS), "application/json; charset=utf-8");
    if (url.pathname === "/api/passage") {
      const chapter = Number(url.searchParams.get("chapter") || 53), from = Number(url.searchParams.get("from") || 4), to = Number(url.searchParams.get("to") || 6);
      return send(response, 200, JSON.stringify(await loadPassage(repoRoot, { book: url.searchParams.get("book") || "Isaiah", chapter, firstVerse: from, lastVerse: to })), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/propositions") {
      const chapter = Number(url.searchParams.get("chapter") || 53), from = Number(url.searchParams.get("from") || 4), to = Number(url.searchParams.get("to") || 6);
      const raw = await loadPassage(repoRoot, { book: url.searchParams.get("book") || "Isaiah", chapter, firstVerse: from, lastVerse: to });
      return send(response, 200, JSON.stringify(buildPropositions(raw)), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/analysis") {
      const chapter = Number(url.searchParams.get("chapter") || 53), from = Number(url.searchParams.get("from") || 4), to = Number(url.searchParams.get("to") || 6);
      const raw = await loadPassage(repoRoot, { book: url.searchParams.get("book") || "Isaiah", chapter, firstVerse: from, lastVerse: to });
      return send(response, 200, JSON.stringify(buildPropositions(raw)), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/jev-state") {
      const chapter = Number(url.searchParams.get("chapter") || 53), from = Number(url.searchParams.get("from") || 4), to = Number(url.searchParams.get("to") || 6);
      const analysis = buildPropositions(await loadPassage(repoRoot, { book: url.searchParams.get("book") || "Isaiah", chapter, firstVerse: from, lastVerse: to }));
      return send(response, 200, JSON.stringify(await buildJevState(analysis, { resolveReferent: createReferentResolver(repoRoot) })), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/jev-results") {
      const chapter = Number(url.searchParams.get("chapter") || 53), from = Number(url.searchParams.get("from") || 4), to = Number(url.searchParams.get("to") || 6);
      const analysis = buildPropositions(await loadPassage(repoRoot, { book: url.searchParams.get("book") || "Isaiah", chapter, firstVerse: from, lastVerse: to }));
      const state = await buildJevState(analysis, { resolveReferent: createReferentResolver(repoRoot) });
      return send(response, 200, JSON.stringify(await loadSavedJevResults({ analysis, state, recordsDirectory: join(appRoot, "var", "openrouter-jev-hebrew-v0.3.0") })), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/passage-candidate-results") return send(response, 200, JSON.stringify(await candidateResults()), "application/json; charset=utf-8");
    if (url.pathname === "/api/one-kings-verification-results") return send(response, 200, JSON.stringify(await oneKingsVerificationResults()), "application/json; charset=utf-8");
    if (url.pathname === "/api/passage-relationships") return send(response, 200, JSON.stringify(await passageRelationships()), "application/json; charset=utf-8");
    const pathname = url.pathname === "/" ? "/public/index.html" : `/public${url.pathname}`;
    const path = fileURLToPath(new URL(`.${pathname}`, import.meta.url));
    if (!path.startsWith(appRoot) || !(await stat(path)).isFile()) return send(response, 404, "Not found");
    return send(response, 200, await readFile(path), types[extname(path)] || "application/octet-stream");
  } catch (error) { return send(response, 500, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"); }
}).listen(Number(process.env.PORT || 1435), "127.0.0.1", () => console.log("MACULA Clause Extractor: http://127.0.0.1:1435/"));
