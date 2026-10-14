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
  const response = { ...graph, validation: validateIsaiahPassageRelationships(graph) };
  const expectedChoice = type => ({ proposed_establishes_predictive_announcement: "establishes_announcement_anchor", proposed_contributes_to_announcement: "contributes_to_announcement_anchor", surrounding_or_other_content: "surrounding_or_other_content", unresolved_relationship: "relationship_underdetermined" })[type];
  const neutralId = item => `relationship:${item.source.proposition_id}:${item.target?.proposition_id || "window_anchor"}:assessment`;
  const labelledId = item => `relationship:${item.source.proposition_id}:${item.relationship_type}:assessment`;
  const latest = async directory => {
    try {
      const index = JSON.parse(await readFile(join(directory, "index.json"), "utf8"));
      const attempt = index.attempts.filter(item => item.status === "succeeded").at(-1);
      return attempt ? JSON.parse(await readFile(join(directory, attempt.file), "utf8")) : null;
    } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  };
  const summarize = (record, { idFor, audit } = {}) => !record ? { status: "missing_saved_result", judgments: {} } : {
    status: "saved_model_judgment", frozen: true,
    boundary: "Jev distributions are model judgments, not canonical facts or supporting rationales.",
    model: { requested: record.requested_model, served: record.served_model, provider: record.provider, request_fingerprint: record.request_fingerprint, usage: record.usage, elapsed_ms: record.elapsed_ms, validation: record.response_validation },
    payload_audit: audit,
    judgments: Object.fromEntries(graph.relationships.map(item => {
      const result = record.raw_response?.answers?.[idFor(item)] || null, proposed = expectedChoice(item.relationship_type);
      return [neutralId(item), result ? { selected_answer: result.choice, probabilities: result.probabilities, reported_confidence: result.confidence, agrees_with_local_proposal: result.choice === proposed, source_and_scope_review_required: item.source.proposition_id === "isa_53_07_2305300700110013_p1" } : null];
    }))
  };
  const labelledRecord = await latest(join(appRoot, "var", "openrouter-jev-passage-relationships-v0.1.0"));
  const neutralRecord = await latest(join(appRoot, "var", "openrouter-jev-passage-relationships-v0.2.0"));
  const labelledPayload = JSON.stringify(labelledRecord?.exact_api_request || {});
  response.relationship_assessments = {
    labelled_pilot_v0_1: summarize(labelledRecord, { idFor: labelledId, audit: labelledRecord ? { finding: labelledPayload.includes("proposed_local_relationship") ? "The saved v0.1 request included local proposed relationship labels as hypotheses. Expected answers were excluded." : "The saved v0.1 request excluded labels and expected answers." } : null }),
    neutral_followup_v0_2: summarize(neutralRecord, { idFor: neutralId, audit: neutralRecord ? { finding: "The v0.2 neutral payload passed its local separation check before inference." } : null })
  };
  response.relationship_assessment = response.relationship_assessments.labelled_pilot_v0_1;
  return response;
}
async function candidateScanResults(url) {
  const ledger = JSON.parse(await readFile(join(appRoot, "var", "candidate-scan-v0.1.0", "ledger.json"), "utf8"));
  const query = (url.searchParams.get("q") || "").trim().toLocaleLowerCase();
  const status = url.searchParams.get("status") || "all";
  const matches = item => {
    const haystack = `${item.reference} ${item.statement_id} ${item.source_text} ${item.classification}`.toLocaleLowerCase();
    return !query || haystack.includes(query);
  };
  const candidates = ledger.candidates.filter(item => matches(item) && (status === "all" || status === "candidate" || item.classification === status));
  const review_queue = (ledger.review_queue || []).filter(item => matches(item) && (status === "all" || status === "review" || item.classification === status));
  const missingFallbacks = ledger.verses.filter(item => item.macula_annotation.status !== "available").map(item => ({ reference: item.reference, verse_id: item.verse_id, macula_annotation: item.macula_annotation, source_text_fallback: item.source_text_fallback }));
  return { scan_kind: ledger.scan_kind, coverage_boundary: ledger.coverage_boundary, source_roster: ledger.source_roster, inventory_policy: ledger.inventory_policy, coverage_summary: ledger.coverage_summary, checkpoint: ledger.checkpoint, spending_cap: ledger.spending_cap, cap_preflight: ledger.cap_preflight, bounded_run: ledger.bounded_run, projection: ledger.projection, representative_batch_outcome: ledger.representative_batch_outcome, ledger_reconciliation: ledger.ledger_reconciliation, representative_batch: { requests: ledger.representative_batch.requests.length, token_estimate: ledger.representative_batch.token_estimate, payload_breakdown: ledger.representative_batch.payload_breakdown, mode: ledger.representative_batch.mode }, review_queue, missing_or_unmapped_macula: missingFallbacks, query: { q: query, status }, candidates };
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
    if (url.pathname === "/api/candidate-scan") return send(response, 200, JSON.stringify(await candidateScanResults(url)), "application/json; charset=utf-8");
    const pathname = url.pathname === "/" ? "/public/index.html" : `/public${url.pathname}`;
    const path = fileURLToPath(new URL(`.${pathname}`, import.meta.url));
    if (!path.startsWith(appRoot) || !(await stat(path)).isFile()) return send(response, 404, "Not found");
    return send(response, 200, await readFile(path), types[extname(path)] || "application/octet-stream");
  } catch (error) { return send(response, 500, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"); }
}).listen(Number(process.env.PORT || 1435), "127.0.0.1", () => console.log("MACULA Clause Extractor: http://127.0.0.1:1435/"));
