import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BOOKS } from "./books.js";
import { loadPassage, loadSourceVerses } from "./extractor.js";
import { buildPropositions } from "./propositions.js";

export const SCAN_VERSION = "0.2.0";
const osis = { Genesis: "Gen", Exodus: "Exod", Leviticus: "Lev", Numbers: "Num", Deuteronomy: "Deut", Joshua: "Josh", Judges: "Judg", Ruth: "Ruth", "1 Samuel": "1Sam", "2 Samuel": "2Sam", "1 Kings": "1Kgs", "2 Kings": "2Kgs", "1 Chronicles": "1Chr", "2 Chronicles": "2Chr", Ezra: "Ezra", Nehemiah: "Neh", Esther: "Esth", Job: "Job", Psalms: "Ps", Proverbs: "Prov", Ecclesiastes: "Eccl", "Song of Songs": "Song", Isaiah: "Isa", Jeremiah: "Jer", Lamentations: "Lam", Ezekiel: "Ezek", Daniel: "Dan", Hosea: "Hos", Joel: "Joel", Amos: "Amos", Obadiah: "Obad", Jonah: "Jonah", Micah: "Mic", Nahum: "Nah", Habakkuk: "Hab", Zephaniah: "Zeph", Haggai: "Hag", Zechariah: "Zech", Malachi: "Mal" };
const candidateChoices = {
  supported_candidate: "The supplied context positively supports predictive-prophecy discovery for this statement.",
  possible_candidate: "Some evidence supports that reading, while a competing reading remains.",
  no_support_in_supplied_context: "The supplied context provides no positive support. This does not establish non-prophecy.",
  underdetermined: "The supplied evidence does not distinguish the available outcomes."
};
const relationshipChoices = {
  establishes_announcement_anchor: "The statement establishes a predictive announcement anchor within this context.",
  contributes_to_announcement_anchor: "The statement contributes to an announcement elsewhere in this context.",
  surrounding_or_other_content: "The statement is surrounding material or has another discourse function.",
  relationship_underdetermined: "The supplied context does not distinguish the statement's relationship."
};
const statementFunctionChoices = {
  predictive_content: "The named statement itself communicates predictive content.",
  contributes_to_predictive_content: "The named statement itself contributes content to a predictive announcement governed in this context.",
  narration_introducing_or_reporting_predictive_content: "The named statement only introduces, reports, or frames nearby predictive content; it is not itself predictive content or a contribution to it.",
  other_content: "The named statement has another function in the supplied context.",
  underdetermined: "The supplied evidence does not distinguish these functions."
};
const readJson = async (path, fallback = null) => { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; } };
const reference = row => `${row.book} ${row.chapter}:${row.verse}`;
const bytes = value => Buffer.byteLength(JSON.stringify(value), "utf8");

/** OSHB is a display-only fallback. It never remaps Protestant references. */
async function oshbVerseMap(repoRoot, book, cache) {
  if (cache.has(book.name)) return cache.get(book.name);
  const output = new Map();
  try {
    const xml = await readFile(join(repoRoot, "source/hebrew/OSHB/morphhb/wlc", `${osis[book.name]}.xml`), "utf8");
    for (const match of xml.matchAll(/<verse\b[^>]*\bosisID="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/gu)) {
      const words = [...match[2].matchAll(/<w\b[^>]*>([\s\S]*?)<\/w>/gu)].map(word => word[1].replace(/<[^>]+>/gu, "").trim()).filter(Boolean);
      if (words.length) output.set(match[1], words.join(" "));
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  cache.set(book.name, output); return output;
}

async function fallbackSourceText(repoRoot, book, row, cache) {
  const osisReference = `${osis[book.name]}.${row.chapter}.${row.verse}`;
  const text = (await oshbVerseMap(repoRoot, book, cache)).get(osisReference);
  return text ? {
    status: "available_direct_coordinate", source: "OSHB", osis_reference: osisReference, text,
    note: "Display fallback only. This is a direct OSIS-coordinate lookup, not an automatic versification mapping or canonical dataset replacement."
  } : { status: "unavailable", source: "OSHB", osis_reference: osisReference, note: "No direct-coordinate OSHB fallback was found. The verse remains visible for manual handling." };
}

function versesFromTranslation(markdown, book) {
  return [...markdown.matchAll(/^###\s+(\d+):(\d+)\s*$/gmu)].map(match => ({ book: book.name, chapter: Number(match[1]), verse: Number(match[2]) }));
}

async function maculaVerseSet(repoRoot, book, chapter, cache) {
  const key = `${book.name}:${chapter}`;
  if (cache.has(key)) return cache.get(key);
  const path = join(repoRoot, "source/hebrew/macula-hebrew-main", `WLC/nodes/${book.number}-${book.macula_code}-${String(chapter).padStart(3, "0")}.xml`);
  try {
    const xml = await readFile(path, "utf8");
    const verses = new Set([...xml.matchAll(/<Sentence\b[^>]*\bverse="([^"]+)"/gu)].map(match => Number(match[1].match(/\s\d+:(\d+)$/u)?.[1])).filter(Number.isInteger));
    const output = { status: "available", verses, path: `source/hebrew/macula-hebrew-main/WLC/nodes/${book.number}-${book.macula_code}-${String(chapter).padStart(3, "0")}.xml` };
    cache.set(key, output); return output;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const output = { status: "missing", verses: new Set(), path: null };
    cache.set(key, output); return output;
  }
}

async function authoritativeRoster(repoRoot) {
  const cache = new Map(), oshbCache = new Map(), roster = [];
  for (const book of BOOKS) {
    const markdown = await readFile(join(repoRoot, "translation/ot", `${book.translation_slug}.md`), "utf8");
    for (const row of versesFromTranslation(markdown, book)) {
      const annotation = await maculaVerseSet(repoRoot, book, row.chapter, cache);
      const missingAnnotation = !annotation.verses.has(row.verse);
      roster.push({
        verse_id: `${book.number}:${row.chapter}:${row.verse}`,
        ...row,
        reference: reference(row),
        osis_reference: `${osis[book.name]}.${row.chapter}.${row.verse}`,
        status: "unprocessed",
        macula_annotation: !missingAnnotation ? { status: "available", file: annotation.path } : { status: "missing_or_unmapped", file: annotation.path, note: "Visible in coverage and eligible for manual handling; it is never excluded from discovery because MACULA is absent or unaligned." },
        source_text_fallback: missingAnnotation ? await fallbackSourceText(repoRoot, book, row, oshbCache) : null,
        statements: [],
        errors: []
      });
    }
  }
  return roster;
}

function latestSucceeded(index) { return index?.attempts?.filter(item => item.status === "succeeded").at(-1) || null; }
function probability(answer) { return answer?.probabilities?.[answer?.choice] ?? null; }
function strongestAlternative(answer) { return Object.entries(answer?.probabilities || {}).filter(([choice]) => choice !== answer.choice).sort(([, left], [, right]) => right - left)[0]?.[1] ?? null; }
/** Model uncertainty is retained for review, never upgraded into a supported inventory candidate. */
export function inventoryDisposition(answer) {
  const selected = probability(answer), alternative = strongestAlternative(answer);
  // This applies to every selected category, including no_support_in_supplied_context.
  if (selected !== null && (selected < .6 || (alternative !== null && alternative >= .25))) return "review_queue";
  if (answer?.choice === "supported_candidate" && selected >= .6 && (alternative === null || alternative < .25)) return "candidate";
  if (["supported_candidate", "possible_candidate", "underdetermined"].includes(answer?.choice)) return "review_queue";
  return "not_candidate";
}
function addStatement(byRef, row, statement, candidates, reviewQueue) {
  const verse = byRef.get(`${row.book}:${row.chapter}:${row.verse}`);
  if (!verse) return;
  verse.statements.push(statement);
  if (statement.inventory_disposition === "candidate") verse.status = "candidate";
  else if (statement.inventory_disposition === "review_queue" && verse.status !== "candidate") verse.status = "uncertain";
  else if (verse.status === "unprocessed") verse.status = "processed";
  const item = { reference: `${row.book} ${row.chapter}:${row.verse}`, statement_id: statement.statement_id, source_text: statement.source_text, classification: statement.assessment, probability: statement.probability, probabilities: statement.probabilities, evidence_kind: statement.evidence_kind, record_file: statement.record_file, inventory_disposition: statement.inventory_disposition };
  if (statement.inventory_disposition === "candidate") candidates.push(item);
  if (statement.inventory_disposition === "review_queue") reviewQueue.push({ ...item, review_reason: "Selected answer is possible/underdetermined or its probability distribution is materially uncertain (selected < 0.60 or strongest alternative ≥ 0.25)." });
}

async function seedIsaiah(repoRoot, byRef, candidates, reviewQueue) {
  const directory = join(repoRoot, "apps/macula-clause-extractor/var/openrouter-jev-passage-candidate-v0.1.0");
  const index = await readJson(join(directory, "index.json"), { attempts: [] }), attempt = latestSucceeded(index);
  if (!attempt) return;
  const record = await readJson(join(directory, attempt.file));
  const analysis = buildPropositions(await loadPassage(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 4, lastVerse: 6 }));
  for (const proposition of analysis.propositions) {
    const answer = record.raw_response?.answers?.[`${proposition.proposition_id}:candidate_assessment`];
    if (!answer) continue;
    const statement = { statement_id: proposition.proposition_id, source_text: proposition.source.text, assessment: answer.choice, probability: probability(answer), probabilities: answer.probabilities, evidence_kind: "saved_passage_candidate_assessment", record_file: attempt.file, inventory_disposition: inventoryDisposition(answer) };
    addStatement(byRef, proposition.reference, statement, candidates, reviewQueue);
  }
}

async function seedOneKings(repoRoot, byRef, candidates, reviewQueue) {
  const directory = join(repoRoot, "apps/macula-clause-extractor/var/openrouter-jev-1ki13-verification-v0.1.0");
  const index = await readJson(join(directory, "index.json"), { attempts: [] }), attempt = latestSucceeded(index);
  if (!attempt) return;
  const record = await readJson(join(directory, attempt.file));
  for (const [caseId, value] of Object.entries(record.exact_api_request?.state?.cases || {})) {
    const answer = record.raw_response?.answers?.[`${caseId}:candidate_assessment`];
    if (!answer) continue;
    for (const target of value.target_propositions || []) {
      const row = target.reference;
      const statement = { statement_id: target.proposition_id, source_text: target.source_text, assessment: answer.choice, probability: probability(answer), probabilities: answer.probabilities, evidence_kind: "saved_one_kings_control", record_file: attempt.file, inventory_disposition: inventoryDisposition(answer) };
      addStatement(byRef, row, statement, candidates, reviewQueue);
    }
  }
}

function compactUnit(proposition) {
  return { statement_id: proposition.proposition_id, reference: proposition.reference, source_word_ids: proposition.source.word_ids, source_text: proposition.source.text, predicate: { word_id: proposition.predicate.word_id, text: proposition.predicate.text, voice: proposition.predicate.voice }, governing_scope: { kind: proposition.complements.length ? "governing_predication_with_embedded_content" : "direct_predication_no_embedded_complement_detected", complements: proposition.complements.map(item => ({ word_ids: item.word_ids, source_text: item.text, scope: item.scope })) } };
}

/** One request per bounded window; all target questions travel together. No network occurs here. */
export async function buildContextWindowRequest(repoRoot, window, { targetVerses = null } = {}) {
  const source_window = await loadSourceVerses(repoRoot, window);
  const analysis = buildPropositions(await loadPassage(repoRoot, window));
  const selectedVerses = targetVerses ? new Set(targetVerses) : null;
  const units = analysis.propositions
    .filter(proposition => !selectedVerses || selectedVerses.has(proposition.reference.verse))
    .map(compactUnit);
  return buildRequestFromEvidence(source_window, units, { window });
}

function buildRequestFromEvidence(source_window, units, { window, fragments = null } = {}) {
  // Definitions are shared once in state. Per-question criteria retain only the allowed keys.
  const commonInstructions = "Assess only the supplied source evidence. Preserve governing speech and evaluation scope. Do not exclude a candidate from past/completed grammar, absent future markers, or absent local modality. Nearby predictive content does not qualify a different target statement. Retain uncertainty when evidence is insufficient.";
  const candidateCriteria = Object.fromEntries(Object.keys(candidateChoices).map(choice => [choice, `See state.question_definitions.candidate_assessment.${choice}`]));
  const relationshipCriteria = Object.fromEntries(Object.keys(relationshipChoices).map(choice => [choice, `See state.question_definitions.relationship.${choice}`]));
  return {
    model: "typesafe/jev-1.13",
    state: {
      scan_kind: "predictive_prophecy_discovery", template_version: SCAN_VERSION,
      coverage_boundary: "This scan covers predictive-prophecy discovery only. Other forms of prophecy remain outside current coverage.",
      context_window: { ...window, ...(fragments ? { fragments, crosses_chapter_boundary: true } : {}) },
      source_window, statements: units, common_instructions: commonInstructions,
      question_definitions: { candidate_assessment: candidateChoices, statement_function: statementFunctionChoices, relationship: relationshipChoices }
    },
    questions: Object.fromEntries(units.flatMap(unit => [
      [`${unit.statement_id}:candidate_assessment`, { type: "choice", instructions: `Apply state.common_instructions. Target only statement ${unit.statement_id} (${unit.source_text}), word IDs ${unit.source_word_ids.join(", ")}, within governing scope ${unit.governing_scope.kind}. Assess whether this named statement itself communicates predictive content or itself contributes content to a predictive announcement; narration merely introducing or reporting nearby prediction is no_support_in_supplied_context.`, criteria: candidateCriteria }],
      [`${unit.statement_id}:statement_function`, { type: "choice", instructions: `Apply state.common_instructions. Target only statement ${unit.statement_id} (${unit.source_text}), within governing scope ${unit.governing_scope.kind}. Distinguish predictive content, contribution to predictive content, and narration introducing or reporting it.`, criteria: Object.fromEntries(Object.keys(statementFunctionChoices).map(choice => [choice, `See state.question_definitions.statement_function.${choice}`])) }],
      [`${unit.statement_id}:relationship`, { type: "choice", instructions: "Apply state.common_instructions. Assess this statement's relationship to an announcement in this context.", criteria: relationshipCriteria }]
    ]))
  };
}

/** Builds one bounded request from ordered fragments, including a chapter boundary when needed. */
export async function buildFragmentContextWindowRequest(repoRoot, fragments) {
  const sources = [], propositions = [];
  for (const fragment of fragments) {
    sources.push(...await loadSourceVerses(repoRoot, fragment));
    propositions.push(...buildPropositions(await loadPassage(repoRoot, fragment)).propositions);
  }
  return buildRequestFromEvidence(sources, propositions.map(compactUnit), { window: { book: fragments[0].book, selected_window: "cross_chapter" }, fragments });
}

function payloadBreakdown(request) {
  const questions = Object.values(request.questions);
  const instructionBytes = questions.reduce((sum, question) => sum + Buffer.byteLength(question.instructions, "utf8"), 0);
  const criteriaBytes = questions.reduce((sum, question) => sum + bytes(question.criteria), 0);
  const uniqueInstructionBytes = [...new Set(questions.map(question => question.instructions))].reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0);
  const uniqueCriteriaBytes = [...new Map(questions.map(question => [JSON.stringify(question.criteria), question.criteria])).values()].reduce((sum, value) => sum + bytes(value), 0);
  const totalBytes = bytes(request);
  return {
    total_bytes: totalBytes, rough_input_tokens: Math.ceil(totalBytes / 4),
    source_window_bytes: bytes(request.state.source_window), statement_bytes: bytes(request.state.statements),
    shared_definition_and_instruction_bytes: bytes({ definitions: request.state.question_definitions, common: request.state.common_instructions }),
    question_instruction_bytes: instructionBytes, repeated_question_instruction_bytes: instructionBytes - uniqueInstructionBytes,
    question_criteria_bytes: criteriaBytes, repeated_question_criteria_bytes: criteriaBytes - uniqueCriteriaBytes,
    question_key_and_type_bytes: bytes(request.questions) - instructionBytes - criteriaBytes,
    other_metadata_bytes: totalBytes - bytes(request.state.source_window) - bytes(request.state.statements) - bytes({ definitions: request.state.question_definitions, common: request.state.common_instructions }) - (bytes(request.questions) - instructionBytes - criteriaBytes) - instructionBytes - criteriaBytes
  };
}

export async function buildRepresentativeBatch(repoRoot) {
  const explicitPrediction = await buildContextWindowRequest(repoRoot, { book: "1 Kings", chapter: 13, firstVerse: 1, lastVerse: 3 });
  const ordinaryNarrative = await buildContextWindowRequest(repoRoot, { book: "1 Kings", chapter: 13, firstVerse: 1, lastVerse: 1 });
  const verseOneIds = explicitPrediction.state.statements.filter(unit => unit.reference.chapter === 13 && unit.reference.verse === 1).map(unit => unit.statement_id);
  const localNarrativeExpectations = Object.fromEntries(verseOneIds.map(id => [id, "no_support_in_supplied_context"]));
  if (JSON.stringify(ordinaryNarrative.state.statements.filter(unit => unit.reference.verse === 1).map(unit => unit.statement_id)) !== JSON.stringify(verseOneIds)) throw new Error("1 Kings 13:1 target identities differ across representative contexts.");
  const cases = [
    { local_case_id: "explicit_prediction", expected_outcome_local_only: "prediction statements may be supported; each 1 Kings 13:1 narration target must remain non-predictive", local_target_expectations: localNarrativeExpectations, request: explicitPrediction },
    { local_case_id: "ordinary_narrative", expected_outcome_local_only: "no support in supplied context", local_target_expectations: localNarrativeExpectations, request: ordinaryNarrative },
    { local_case_id: "poetry", expected_outcome_local_only: "retain ambiguity; do not presume prediction from poetic form", request: await buildContextWindowRequest(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 4, lastVerse: 6 }) },
    { local_case_id: "cross_chapter_prediction_context", expected_outcome_local_only: "test whether chapter boundary does not sever needed predictive context", request: await buildFragmentContextWindowRequest(repoRoot, [{ book: "Isaiah", chapter: 52, firstVerse: 13, lastVerse: 15 }, { book: "Isaiah", chapter: 53, firstVerse: 1, lastVerse: 2 }]) }
  ];
  const requests = cases.map(item => item.request), breakdown = requests.map(payloadBreakdown);
  const totalBytes = breakdown.reduce((sum, item) => sum + item.total_bytes, 0);
  const sampleVerses = 3 + 1 + 3 + 5;
  return {
    schema_version: "0.1.0", mode: "dry_run_only", batch_kind: "representative_multi_passage_context_batch",
    // Expectations remain in this local envelope; request objects are the only intended model payloads.
    cases, requests, payload_breakdown: { per_request: breakdown, aggregate: Object.fromEntries(Object.keys(breakdown[0]).map(key => [key, breakdown.reduce((sum, item) => sum + (typeof item[key] === "number" ? item[key] : 0), 0)])) },
    token_estimate: { method: "byte_divided_by_4", estimated_input_tokens: Math.ceil(totalBytes / 4), exact_count_available: false, limitation: "Rough byte-based estimate, not an exact tokenizer count or guaranteed conservative bound." }, sample_verses: sampleVerses
  };
}

export function enforceSpendingCap({ projected_input_tokens, projected_estimated_usd }, cap) {
  if (projected_input_tokens + cap.spent_input_tokens > cap.max_input_tokens) throw new Error("Projected scan exceeds configured input-token cap.");
  if (projected_estimated_usd + cap.spent_estimated_usd > cap.max_estimated_usd) throw new Error("Projected scan exceeds configured spending cap.");
  return true;
}

/** Plans a resumable subset. A future executor must check this same boundary before every window. */
export function planBoundedRun(windows, projection, cap, { requested_windows = 100 } = {}) {
  const availableInput = Math.max(0, cap.max_input_tokens - cap.spent_input_tokens);
  const perWindow = Math.max(1, Math.ceil(projection.projected_input_tokens / projection.projected_windows));
  const capWindows = Math.floor(availableInput / perWindow);
  const permitted = Math.min(requested_windows, capWindows, windows.length);
  return {
    status: permitted ? "ready_for_bounded_resumable_run" : "blocked_before_start",
    requested_windows, permitted_windows: permitted, max_windows_by_input_cap: capWindows,
    estimated_input_tokens: permitted * perWindow, available_input_tokens_before_start: availableInput,
    stop_rule: "Before each window, stop without sending it if its estimated input would exceed the remaining input-token or USD cap.",
    window_ids: windows.slice(0, permitted).map(window => window.window_id),
    limitation: "Per-window values are rough byte-based planning estimates; execution must record actual usage and never silently continue after a cap stop."
  };
}

export function buildScanWindows(verses, windowSize = 6) {
  const chapters = new Map();
  for (const verse of verses) {
    const key = `${verse.book}:${verse.chapter}`;
    if (!chapters.has(key)) chapters.set(key, []);
    chapters.get(key).push(verse);
  }
  return [...chapters.values()].flatMap(rows => {
    rows.sort((left, right) => left.verse - right.verse);
    const windows = [];
    for (let index = 0; index < rows.length; index += windowSize) {
      const slice = rows.slice(index, index + windowSize), first = slice[0], last = slice.at(-1);
      windows.push({ window_id: `${first.verse_id}-${last.verse_id}`, book: first.book, chapter: first.chapter, firstVerse: first.verse, lastVerse: last.verse, verse_ids: slice.map(row => row.verse_id), status: "unprocessed" });
    }
    return windows;
  });
}

export async function buildCandidateScanLedger(repoRoot, { cap = { currency: "USD", max_input_tokens: 2_000_000, max_estimated_usd: 25, estimated_input_usd_per_million_tokens: 0.042, spent_input_tokens: 0, spent_estimated_usd: 0 }, requested_windows = 100 } = {}) {
  const verses = await authoritativeRoster(repoRoot), byRef = new Map(verses.map(row => [`${row.book}:${row.chapter}:${row.verse}`, row])), candidates = [], review_queue = [];
  await seedIsaiah(repoRoot, byRef, candidates, review_queue);
  await seedOneKings(repoRoot, byRef, candidates, review_queue);
  const representative_batch = await buildRepresentativeBatch(repoRoot);
  const perVerseInput = representative_batch.token_estimate.estimated_input_tokens / representative_batch.sample_verses;
  const windowSize = 6, windows = buildScanWindows(verses, windowSize), projectedWindows = windows.length, projectedInput = Math.ceil(perVerseInput * verses.length + projectedWindows * 35);
  const projectedOutput = candidates.length ? Math.ceil((representative_batch.requests.reduce((sum, request) => sum + Object.keys(request.questions).length, 0) / representative_batch.sample_verses) * verses.length * 12) : null;
  const summary = Object.fromEntries(["unprocessed", "processed", "candidate", "uncertain", "failed"].map(status => [status, verses.filter(row => row.status === status).length]));
  summary.missing_or_unmapped_macula = verses.filter(row => row.macula_annotation.status !== "available").length;
  summary.source_text_fallback_available = verses.filter(row => row.source_text_fallback?.status === "available_direct_coordinate").length;
  summary.source_text_fallback_unavailable = summary.missing_or_unmapped_macula - summary.source_text_fallback_available;
  const projection = { window_size_verses: windowSize, projected_windows: projectedWindows, projected_input_tokens: projectedInput, projected_output_tokens: projectedOutput, estimate_method: "representative_request_bytes_divided_by_4_extrapolated_by_Protestant_verse_roster", limitation: "Rough planning estimate only; actual provider tokenization and response size may differ." };
  const projectedEstimatedUsd = projectedInput / 1_000_000 * cap.estimated_input_usd_per_million_tokens;
  projection.projected_estimated_usd = projectedEstimatedUsd;
  let cap_preflight;
  try { enforceSpendingCap({ projected_input_tokens: projectedInput, projected_estimated_usd: projectedEstimatedUsd }, cap); cap_preflight = { allowed: true, reason: null }; }
  catch (error) { cap_preflight = { allowed: false, reason: error.message }; }
  const bounded_run = planBoundedRun(windows, projection, cap, { requested_windows });
  return { schema_version: "0.2.0", scan_version: SCAN_VERSION, scan_kind: "predictive_prophecy_discovery", coverage_boundary: "Predictive-prophecy discovery only. Other forms of prophecy are outside this scan's current coverage.", inventory_policy: { candidate: "Only a supported_candidate judgment with selected probability ≥ 0.60 and strongest alternative < 0.25.", review_queue: "Any selected category, including no_support_in_supplied_context, when selected probability < 0.60 or strongest alternative ≥ 0.25; also every possible_candidate or underdetermined judgment. Review items are not labeled supported candidates." }, source_roster: { authority: "Protestant verse headings in translation/ot; MACULA is an optional annotation layer", verse_count: verses.length }, spending_cap: cap, cap_preflight, bounded_run, checkpoint: { status: "prepared_not_started", next_window_index: 0, completed_windows: 0, failed_windows: 0, total_windows: windows.length, cache_policy: "Reuse a succeeded request only when its exact request fingerprint and served model digest match." }, coverage_summary: summary, verses, windows, candidates, review_queue, representative_batch, projection };
}
