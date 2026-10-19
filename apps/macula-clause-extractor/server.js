import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lbfVerses, loadPassage } from "./src/extractor.js";
import { BOOKS, findBook } from "./src/books.js";
import { buildPropositions } from "./src/propositions.js";
import { buildJevState, createReferentResolver } from "./src/jev-state.js";
import { loadSavedJevResults } from "./src/jev-results.js";
import { buildIsaiahPassageRelationships, validateIsaiahPassageRelationships } from "./src/passage-relationships.js";
import { JEV_CUMULATIVE_USD_CAP, recordedSpend } from "./jev-budget.js";
import { acknowledgeWorkerAlert, readWorkerAlert } from "./worker-alerts.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const reviewDecisionsPath = join(appRoot, "var", "human-review-decisions-v0.1.0.json");
let exportedVerseInventory = null;
let reviewWrite = Promise.resolve();
const lbfMarkdownCache = new Map();
const maculaGlossCache = new Map();
function send(response, status, body, type = "text/plain; charset=utf-8", headers = {}) { response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers }); response.end(body); }
async function sendDownload(response, filename, type) {
  const path = join(appRoot, "var", "exports", filename);
  return send(response, 200, await readFile(path), type, { "Content-Disposition": `attachment; filename="${filename}"` });
}
async function readJsonOr(path, fallback) { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; } }
async function verseInventory() {
  if (!exportedVerseInventory) exportedVerseInventory = JSON.parse(await readFile(join(appRoot, "var", "exports", "predictive-prophecy-candidate-review-verses-v1.0.0.json"), "utf8"));
  return exportedVerseInventory;
}
async function humanReviewStore() {
  const store = await readJsonOr(reviewDecisionsPath, { schema_version: "0.1.0", label: "Human review decisions; separate from canonical evidence and model judgments", decisions: {}, spanish_comparison_spans: {} });
  return { ...store, decisions: store.decisions || {}, spanish_comparison_spans: store.spanish_comparison_spans || {} };
}
const ntLbfBooks = { MAT: "mateo", MRK: "marcos", LUK: "lucas", JHN: "juan", ACT: "hechos", ROM: "romanos", "1CO": "1corintios", "2CO": "2corintios", GAL: "galatas", EPH: "efesios", PHP: "filipenses", COL: "colosenses", "1TH": "1tesalonicenses", "2TH": "2tesalonicenses", "1TI": "1timoteo", "2TI": "2timoteo", TIT: "tito", PHM: "filemon", HEB: "hebreos", JAS: "santiago", "1PE": "1pedro", "2PE": "2pedro", "1JN": "1juan", "2JN": "2juan", "3JN": "3juan", JUD: "judas", REV: "apocalipsis" };
async function lbfMarkdown(testament, slug) {
  const key = `${testament}:${slug}`;
  if (!lbfMarkdownCache.has(key)) lbfMarkdownCache.set(key, readFile(join(repoRoot, "translation", testament, `${slug}.md`), "utf8").catch(error => error.code === "ENOENT" ? null : Promise.reject(error)));
  return lbfMarkdownCache.get(key);
}
async function spanishReading(reference) {
  const ot = reference.match(/^(.+)\s(\d+):(\d+)$/u);
  const nt = reference.match(/^([1-3]?[A-Z]+)\.(\d+)\.(\d+)$/u);
  const testament = ot ? "ot" : nt ? "nt" : null;
  const slug = ot ? findBook(ot[1])?.translation_slug : nt ? ntLbfBooks[nt[1]] : null;
  const chapter = Number((ot || nt || [])[2]), verse = Number((ot || nt || [])[3]);
  if (!testament || !slug || !Number.isInteger(chapter) || !Number.isInteger(verse)) return { status: "unavailable", text: null, reason: "No canonical LBF file mapping is configured for this reference." };
  const markdown = await lbfMarkdown(testament, slug);
  const text = markdown ? lbfVerses(markdown, chapter, verse, verse).get(verse) || null : null;
  return text ? { status: "available", text, source: `translation/${testament}/${slug}.md`, label: "Full LBF verse for context only — not a translation of this individual source statement" } : { status: "unavailable", text: null, source: `translation/${testament}/${slug}.md`, reason: "The canonical LBF file has no text for this verse." };
}
async function maculaEnglishGloss(item) {
  if (item.target_kind !== "annotated_statement" || item.testament !== "OT") return { status: "unavailable", reason: "No transferable MACULA structure is available for this target." };
  if (maculaGlossCache.has(item.statement_id)) return maculaGlossCache.get(item.statement_id);
  const match = item.verse_reference.match(/^(.+)\s(\d+):(\d+)$/u), book = match && findBook(match[1]), chapter = Number(match?.[2]), verse = Number(match?.[3]);
  if (!book || !Number.isInteger(chapter) || !Number.isInteger(verse)) return { status: "unavailable", reason: "The saved target cannot be resolved to a MACULA Hebrew verse." };
  const result = (async () => {
    try {
      const raw = await loadPassage(repoRoot, { book: book.name, chapter, firstVerse: verse, lastVerse: verse });
      const proposition = buildPropositions(raw).propositions.find(candidate => candidate.proposition_id === item.statement_id);
      if (!proposition) return { status: "unavailable", reason: "The saved statement ID is not present in the current MACULA extraction." };
      const clause = raw.clauses.find(candidate => proposition.source_nodes.includes(candidate.macula_node_id));
      const words = clause?.macula.words.filter(word => proposition.source.word_ids.includes(word.word_id)).map(word => ({ source: word.text, gloss: word.english || word.gloss || null })).filter(word => word.gloss) || [];
      return words.length ? { status: "available", words, label: "MACULA Cherith English word glosses — interlinear aid, not a translated phrase or LBF alignment" } : { status: "unavailable", reason: "MACULA has no English glosses for this target's source words." };
    } catch (error) {
      return { status: "unavailable", reason: `MACULA gloss extraction is unavailable for this target: ${error.code || error.message}` };
    }
  })();
  maculaGlossCache.set(item.statement_id, result);
  return result;
}
function reviewableItems(inventory) { return inventory.verses.flatMap(verse => verse.items.map(item => ({ ...item, verse_reference: verse.verse_reference, testament: verse.testament, verse_disposition: verse.disposition, source_only_assessment: verse.source_only_assessment, mapping_limitations: verse.mapping_limitations, verse_scope_availability: verse.scope_availability }))); }
function reviewSummary(items, decisions) {
  const total = items.length, reviewed = items.filter(item => decisions[item.statement_id]).length;
  return { total_reviewable_statements: total, reviewed_statements: reviewed, unreviewed_statements: total - reviewed, decisions_by_outcome: Object.values(decisions).reduce((counts, item) => { counts[item.decision] = (counts[item.decision] || 0) + 1; return counts; }, {}) };
}
async function reviewQueue(url) {
  const [inventory, store] = await Promise.all([verseInventory(), humanReviewStore()]);
  const disposition = ["candidate", "review", "all"].includes(url.searchParams.get("disposition")) ? url.searchParams.get("disposition") : "candidate";
  const reviewStatus = ["unreviewed", "reviewed", "all"].includes(url.searchParams.get("review_status")) ? url.searchParams.get("review_status") : "unreviewed";
  const testament = ["OT", "NT", "all"].includes(url.searchParams.get("testament")) ? url.searchParams.get("testament") : "all";
  const targetKind = ["annotated_statement", "source_only_span", "all"].includes(url.searchParams.get("target_kind")) ? url.searchParams.get("target_kind") : "annotated_statement";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 10), 1), 25);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
  const all = reviewableItems(inventory);
  const filtered = all.filter(item => (disposition === "all" || item.verse_disposition === disposition) && (testament === "all" || item.testament === testament) && (targetKind === "all" || item.target_kind === targetKind) && (reviewStatus === "all" || (reviewStatus === "reviewed") === Boolean(store.decisions[item.statement_id]))).sort((a, b) => b.selected_probability - a.selected_probability || a.verse_reference.localeCompare(b.verse_reference));
  return {
    label: "Human review queue — saved source evidence and model judgments remain separate",
    boundary: "A human decision records review only. It does not alter canonical evidence, the Jev judgment, or a theological conclusion.",
    choices: ["retain_predictive_candidate", "not_predictive_in_context", "needs_broader_context", "uncertain"],
    filters: { disposition, review_status: reviewStatus, testament, target_kind: targetKind, limit, offset },
    summary: reviewSummary(all, store.decisions), total_matching: filtered.length,
    items: await Promise.all(filtered.slice(offset, offset + limit).map(async item => {
      const spanish_reading = await spanishReading(item.verse_reference), savedSpan = store.spanish_comparison_spans[item.statement_id] || null;
      const spanish_highlight = savedSpan && spanish_reading.text && spanish_reading.text.slice(savedSpan.start, savedSpan.end) === savedSpan.text ? savedSpan : null;
      return { ...item, spanish_reading, spanish_highlight, macula_english_gloss: await maculaEnglishGloss(item), human_review: store.decisions[item.statement_id] || null };
    }))
  };
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => { body += chunk; if (body.length > 12_000) reject(new Error("Request body is too large.")); });
    request.once("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Request body must be valid JSON.")); } });
    request.once("error", reject);
  });
}
async function saveHumanReview(body) {
  const allowed = new Set(["retain_predictive_candidate", "not_predictive_in_context", "needs_broader_context", "uncertain"]);
  if (typeof body.statement_id !== "string" || !allowed.has(body.decision)) throw new Error("A valid statement and review decision are required.");
  const inventory = await verseInventory();
  const item = reviewableItems(inventory).find(entry => entry.statement_id === body.statement_id);
  if (!item) throw new Error("The selected statement is not in the saved review inventory.");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 4000) : "";
  reviewWrite = reviewWrite.then(async () => {
    const store = await humanReviewStore();
    store.decisions[body.statement_id] = { statement_id: body.statement_id, decision: body.decision, note, reviewed_at: new Date().toISOString(), source_reference: item.verse_reference, target_kind: item.target_kind, model_assessment: item.assessment, model_selected_probability: item.selected_probability };
    await mkdir(join(appRoot, "var"), { recursive: true });
    await writeFile(reviewDecisionsPath, `${JSON.stringify(store, null, 2)}\n`);
    return store.decisions[body.statement_id];
  });
  return reviewWrite;
}
async function saveSpanishComparisonSpan(body) {
  if (typeof body.statement_id !== "string") throw new Error("A statement ID is required.");
  const inventory = await verseInventory(), item = reviewableItems(inventory).find(entry => entry.statement_id === body.statement_id);
  if (!item) throw new Error("The selected statement is not in the saved review inventory.");
  const reading = await spanishReading(item.verse_reference);
  if (!reading.text) throw new Error("No LBF Spanish verse is available for this statement.");
  const clear = body.clear === true;
  const start = Number(body.start), end = Number(body.end);
  if (!clear && (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > reading.text.length)) throw new Error("Select a nonempty span inside the displayed Spanish verse.");
  const saved = clear ? null : { start, end, text: reading.text.slice(start, end), selected_at: new Date().toISOString(), label: "Reviewer-selected Spanish comparison span — not verified source-to-Spanish alignment" };
  reviewWrite = reviewWrite.then(async () => {
    const store = await humanReviewStore();
    if (saved) store.spanish_comparison_spans[body.statement_id] = saved;
    else delete store.spanish_comparison_spans[body.statement_id];
    await mkdir(join(appRoot, "var"), { recursive: true });
    await writeFile(reviewDecisionsPath, `${JSON.stringify(store, null, 2)}\n`);
    return saved;
  });
  return reviewWrite;
}
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
  const readJsonOr = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; } };
  const [otIndex, ntInventory, fallbackInventory, worker, worker_alert, spend, coordinateReview, coordinateRecovery] = await Promise.all([
    readJsonOr(join(appRoot, "var", "openrouter-jev-genesis-compact-tranche-v0.2.0", "index.json"), { attempts: [] }),
    readJsonOr(join(appRoot, "var", "nt-source-only-inventory-v0.1.0.json"), { coverage: { assessed_spans: 0 } }),
    readJsonOr(join(appRoot, "var", "ot-fallback-source-only-inventory-v0.1.0.json"), { coverage: { assessed_spans: 0 } }),
    readJsonOr(join(appRoot, "var", "jev-continuous-worker-status.json"), { state: "not_running" }),
    readWorkerAlert(appRoot),
    recordedSpend(join(appRoot, "var")),
    readJsonOr(join(appRoot, "var", "protestant-coordinate-review-v0.1.0.json"), null),
    readJsonOr(join(appRoot, "var", "coordinate-recovery-report-v0.1.0.json"), null),
  ]);
  const liveCoverage = Object.fromEntries(["unprocessed", "processed", "candidate", "uncertain", "failed"].map(name => [name, ledger.verses.filter(verse => verse.status === name).length]));
  liveCoverage.missing_or_unmapped_macula = ledger.verses.filter(verse => verse.macula_annotation.status !== "available").length;
  liveCoverage.source_text_fallback_available = ledger.verses.filter(verse => verse.source_text_fallback?.status === "available_direct_coordinate").length;
  liveCoverage.source_text_fallback_unavailable = liveCoverage.missing_or_unmapped_macula - liveCoverage.source_text_fallback_available;
  const succeeded = otIndex.attempts.filter(attempt => attempt.status === "succeeded");
  const lastOt = succeeded.at(-1) || null;
  const eligibleWorkExhausted = worker.state === "paused" && worker.pause_reason === "eligible_routes_exhausted";
  const live_status = {
    label: eligibleWorkExhausted ? "Eligible scan work complete — source-text gaps remain" : "Active resumable scan — saved checkpoints",
    annotated_ot: { completed_windows: succeeded.length, next_window_index: ledger.sequential_roster_cursor?.next_window_index ?? null, last_checkpoint: lastOt?.window_id ?? null },
    nt_source_only: ntInventory.coverage,
    ot_fallback_source_only: fallbackInventory.coverage,
    worker, worker_alert,
    spending: { usd: spend.usd, cap_usd: JEV_CUMULATIVE_USD_CAP, input_tokens: spend.usage.input_tokens, output_tokens: spend.usage.output_tokens },
  };
  const missingFallbacks = ledger.verses.filter(item => item.macula_annotation.status !== "available").map(item => ({ reference: item.reference, verse_id: item.verse_id, macula_annotation: item.macula_annotation, source_text_fallback: item.source_text_fallback }));
  return {
    scan_kind: ledger.scan_kind, coverage_boundary: ledger.coverage_boundary, source_roster: ledger.source_roster,
    inventory_policy: ledger.inventory_policy, coverage_summary: liveCoverage, live_status,
    coordinate_review: coordinateReview ? { summary: coordinateReview.summary, rules: coordinateReview.rules, status: "nonoperative_manual_review_required" } : null,
    coordinate_recovery: coordinateRecovery, representative_batch_outcome: ledger.representative_batch_outcome,
    ledger_reconciliation: ledger.ledger_reconciliation,
    representative_batch: { requests: ledger.representative_batch.requests.length, token_estimate: ledger.representative_batch.token_estimate, payload_breakdown: ledger.representative_batch.payload_breakdown, mode: ledger.representative_batch.mode },
    inventory_counts: { candidate_statements: ledger.candidates.length, review_statements: (ledger.review_queue || []).length, macula_gaps: missingFallbacks.length },
    downloads: [
      { label: "Candidate and review verses (JSON)", href: "/downloads/predictive-prophecy-candidate-review-verses-v1.0.0.json", format: "38 MB" },
      { label: "Candidate and review verses (JSONL)", href: "/downloads/predictive-prophecy-candidate-review-verses-v1.0.0.jsonl", format: "26 MB" },
      { label: "Completion and coverage report (Markdown)", href: "/downloads/predictive-prophecy-completion-report-v0.1.0.md", format: "1 KB" },
      { label: "Detailed statement inventory (JSON)", href: "/downloads/predictive-prophecy-inventory-v0.1.0.json", format: "83 MB" }
    ]
  };
}
async function startWorker(response) {
  const lockPath = join(appRoot, "var", "jev-continuous-worker.lock");
  if (existsSync(lockPath)) return send(response, 409, JSON.stringify({ error: "The continuous-worker lock exists; refresh status before attempting another restart." }), "application/json; charset=utf-8");
  const statusPath = join(appRoot, "var", "jev-continuous-worker-status.json");
  let status = null;
  try { status = JSON.parse(await readFile(statusPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const stop = status?.last_cycle?.result?.results?.find(result => result.stop?.reason === "Prior unsuccessful attempt requires explicit recovery")?.stop;
  const environment = stop?.before ? { ...process.env, JEV_EXPLICIT_RECOVERY_WINDOW: stop.before } : process.env;
  const child = spawn(process.execPath, [join(appRoot, "start-jev-continuous-worker.js")], { cwd: appRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", errorOutput = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { errorOutput += data; });
  child.once("error", error => send(response, 500, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"));
  child.once("close", async code => {
    if (code !== 0) return send(response, 500, JSON.stringify({ error: errorOutput.trim() || `Worker launcher exited ${code}` }), "application/json; charset=utf-8");
    try {
      await acknowledgeWorkerAlert(appRoot);
      return send(response, 202, JSON.stringify({ status: "starting", launcher: JSON.parse(output) }), "application/json; charset=utf-8");
    } catch (error) { return send(response, 500, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"); }
  });
}
createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  try {
    if (url.pathname === "/api/scan-worker/resume" && request.method === "POST") return await startWorker(response);
    if (url.pathname === "/api/scan-worker/alert/acknowledge" && request.method === "POST") return send(response, 200, JSON.stringify(await acknowledgeWorkerAlert(appRoot)), "application/json; charset=utf-8");
    if (url.pathname === "/api/human-review-queue" && request.method === "GET") return send(response, 200, JSON.stringify(await reviewQueue(url)), "application/json; charset=utf-8");
    if (url.pathname === "/api/human-review-decisions" && request.method === "POST") return send(response, 201, JSON.stringify(await saveHumanReview(await readBody(request))), "application/json; charset=utf-8");
    if (url.pathname === "/api/human-review-decisions" && request.method === "GET") return send(response, 200, JSON.stringify(await humanReviewStore()), "application/json; charset=utf-8");
    if (url.pathname === "/api/human-review-span" && request.method === "POST") return send(response, 201, JSON.stringify(await saveSpanishComparisonSpan(await readBody(request))), "application/json; charset=utf-8");
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
    if (url.pathname === "/api/protestant-coordinate-review") return send(response, 200, await readFile(join(appRoot, "var", "protestant-coordinate-review-v0.1.0.json"), "utf8"), "application/json; charset=utf-8");
    if (url.pathname === "/api/predictive-prophecy-inventory") return send(response, 200, await readFile(join(appRoot, "var", "exports", "predictive-prophecy-inventory-v0.1.0.json"), "utf8"), "application/json; charset=utf-8");
    if (url.pathname === "/api/predictive-prophecy-candidate-review-verses") return send(response, 200, await readFile(join(appRoot, "var", "exports", "predictive-prophecy-candidate-review-verses-v1.0.0.json"), "utf8"), "application/json; charset=utf-8");
    if (url.pathname === "/api/predictive-prophecy-completion-report") return send(response, 200, await readFile(join(appRoot, "var", "exports", "predictive-prophecy-completion-report-v0.1.0.json"), "utf8"), "application/json; charset=utf-8");
    if (url.pathname === "/api/coordinate-recovery-report") return send(response, 200, await readFile(join(appRoot, "var", "coordinate-recovery-report-v0.1.0.json"), "utf8"), "application/json; charset=utf-8");
    if (url.pathname === "/downloads/predictive-prophecy-candidate-review-verses-v1.0.0.json") return sendDownload(response, "predictive-prophecy-candidate-review-verses-v1.0.0.json", "application/json; charset=utf-8");
    if (url.pathname === "/downloads/predictive-prophecy-candidate-review-verses-v1.0.0.jsonl") return sendDownload(response, "predictive-prophecy-candidate-review-verses-v1.0.0.jsonl", "application/x-ndjson; charset=utf-8");
    if (url.pathname === "/downloads/predictive-prophecy-completion-report-v0.1.0.md") return sendDownload(response, "predictive-prophecy-completion-report-v0.1.0.md", "text/markdown; charset=utf-8");
    if (url.pathname === "/downloads/predictive-prophecy-inventory-v0.1.0.json") return sendDownload(response, "predictive-prophecy-inventory-v0.1.0.json", "application/json; charset=utf-8");
    const pathname = url.pathname === "/" ? "/public/index.html" : `/public${url.pathname}`;
    const path = fileURLToPath(new URL(`.${pathname}`, import.meta.url));
    if (!path.startsWith(appRoot) || !(await stat(path)).isFile()) return send(response, 404, "Not found");
    return send(response, 200, await readFile(path), types[extname(path)] || "application/octet-stream");
  } catch (error) { return send(response, 500, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"); }
}).listen(Number(process.env.PORT || 1435), "127.0.0.1", () => console.log("MACULA Clause Extractor: http://127.0.0.1:1435/"));
