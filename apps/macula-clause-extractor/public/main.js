const form = document.querySelector("#range"), summary = document.querySelector("#summary"), clauses = document.querySelector("#clauses"), raw = document.querySelector("#json"), template = document.querySelector("#clause"), results = document.querySelector("#jev-results"), resultTemplate = document.querySelector("#jev-unit");
const candidateResults = document.querySelector("#candidate-results"), candidateTemplate = document.querySelector("#candidate-unit");
const verificationResults = document.querySelector("#verification-results");
const relationshipResults = document.querySelector("#relationship-results");
const scanResults = document.querySelector("#scan-results");
const text = value => value === null || value === undefined || value === "" ? "—" : String(value);
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
function json(value) { const node = document.createElement("pre"); node.textContent = JSON.stringify(value, null, 2); return node; }
function line(label, value) { const item = document.createElement("p"), name = document.createElement("strong"); name.textContent = `${label}: `; item.append(name, document.createTextNode(text(value))); return item; }
function showScan(data) {
  scanResults.replaceChildren();
  const heading = document.createElement("div"); heading.className = "scan-heading";
  const title = document.createElement("h2"); title.textContent = "Scripture-wide predictive-prophecy discovery";
  heading.append(title, line("Coverage", `${data.source_roster.verse_count.toLocaleString()} Protestant verses · scan not started`), line("Scope", data.coverage_boundary), line("Checkpoint", `${data.checkpoint.completed_windows} completed windows · ${data.checkpoint.next_window_index} next`));
  const coverage = document.createElement("div"); coverage.className = "coverage-chips";
  for (const status of ["unprocessed", "processed", "candidate", "uncertain", "failed", "missing_or_unmapped_macula", "source_text_fallback_available", "source_text_fallback_unavailable"]) { const chip = document.createElement("span"); chip.textContent = `${status.replaceAll("_", " ")}: ${data.coverage_summary[status] || 0}`; coverage.append(chip); }
  heading.append(coverage);
  if (!data.cap_preflight.allowed) { const cap = document.createElement("p"); cap.className = "scan-blocked"; cap.textContent = `Full-corpus projection exceeds the cap: ${data.cap_preflight.reason} Rough projection: ${data.projection.projected_input_tokens.toLocaleString()} input tokens across ${data.projection.projected_windows.toLocaleString()} windows. This does not block the prepared bounded run.`; heading.append(cap); }
  if (data.bounded_run) heading.append(line("Bounded resumable run", `${data.bounded_run.status.replaceAll("_", " ")} · ${data.bounded_run.permitted_windows} windows · rough ${data.bounded_run.estimated_input_tokens.toLocaleString()} input tokens · stops before the 2M-token cap`));
  const details = document.createElement("details"), detailsTitle = document.createElement("summary"); detailsTitle.textContent = "Representative dry-run batch and estimate"; details.append(detailsTitle, line("Requests", data.representative_batch.requests), line("Batch rough input", data.representative_batch.token_estimate.estimated_input_tokens), line("Estimate limitation", data.projection.limitation), json(data.representative_batch.payload_breakdown)); heading.append(details);
  const gaps = document.createElement("details"), gapsTitle = document.createElement("summary"); gapsTitle.textContent = `${data.missing_or_unmapped_macula.length} visible MACULA gaps — source fallback where directly available`; gaps.append(gapsTitle, json(data.missing_or_unmapped_macula)); heading.append(gaps); scanResults.append(heading);
  const controls = document.createElement("form"); controls.className = "scan-search"; const label = document.createElement("label"); label.textContent = "Search saved candidates"; const input = document.createElement("input"); input.type = "search"; input.value = data.query.q; input.placeholder = "Reference, statement ID, or Hebrew"; label.append(input); controls.append(label); scanResults.append(controls);
  input.addEventListener("change", () => loadScan(input.value));
  const list = document.createElement("div"); list.className = "scan-candidates";
  if (!data.candidates.length) { const none = document.createElement("p"); none.textContent = "No saved supported, possible, or uncertain candidates match this search."; list.append(none); }
  for (const candidate of data.candidates) { const card = document.createElement("article"); card.className = "scan-candidate"; const ref = document.createElement("h2"); ref.textContent = candidate.reference; const source = document.createElement("p"); source.className = "hebrew"; source.dir = "rtl"; source.textContent = candidate.source_text; const judgment = document.createElement("p"); judgment.className = "scan-judgment"; judgment.textContent = `${candidate.classification.replaceAll("_", " ")} · ${percent(candidate.probability)} · ${candidate.statement_id}`; card.append(ref, source, judgment); list.append(card); }
  scanResults.append(list);
  const review = document.createElement("details"), reviewTitle = document.createElement("summary"); reviewTitle.textContent = `Uncertainty review queue: ${data.review_queue.length} matching statements`; review.append(reviewTitle, line("Retention rule", data.inventory_policy?.review_queue || "Material uncertainty is retained for review."));
  for (const item of data.review_queue) { const card = document.createElement("article"); card.className = "scan-candidate"; const ref = document.createElement("h2"); ref.textContent = item.reference; const source = document.createElement("p"); source.className = "hebrew"; source.dir = "rtl"; source.textContent = item.source_text; const judgment = document.createElement("p"); judgment.className = "scan-judgment"; judgment.textContent = `Review: ${item.classification.replaceAll("_", " ")} · ${percent(item.probability)} · ${item.statement_id}`; card.append(ref, source, judgment, line("Reason", item.review_reason)); review.append(card); }
  scanResults.append(review);
}
async function loadScan(query = "") { const response = await fetch(`/api/candidate-scan?q=${encodeURIComponent(query)}`), data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load scan coverage."); showScan(data); }
function showJev(data) {
  results.replaceChildren();
  const heading = document.createElement("div"); heading.className = "jev-heading";
  const title = document.createElement("h2"); title.textContent = data.label;
  heading.append(title, line("Objective", data.objective), line("Boundary", data.warning)); results.append(heading);
  for (const unit of data.units) {
    const view = resultTemplate.content.cloneNode(true), evidence = unit.linguistic_evidence, judgment = unit.model_judgment;
    view.querySelector(".record-status").textContent = `${unit.reference.book} ${unit.reference.chapter}:${unit.reference.verse} · ${unit.record_status.replaceAll("_", " ")}`;
    view.querySelector("h2").textContent = unit.proposition_id;
    view.querySelector(".source-expression").textContent = evidence.source_expression.text;
    view.querySelector(".predicate").textContent = `Predicate head: ${text(evidence.predicate.text)} · ${text(evidence.predicate.word_id)} · surface expression: ${text(evidence.predicate.surface_expression?.text)} · voice: ${text(evidence.predicate.voice)}`;
    const complements = evidence.grammatical_scope.complements.map(item => `${item.source_text} → governed by ${item.scope.governing_predicate_word_id}`).join("; ");
    view.querySelector(".scope").textContent = `Grammar: ${evidence.grammatical_scope.source_rule}${complements ? ` · governed complement: ${complements}` : ""}`;
    const target = view.querySelector(".judgment");
    if (!judgment) target.append(line("Saved Jev record", unit.record_status === "missing_record" ? "Missing — no inference will be started." : "Outdated or unsuccessful — retained for audit, not displayed as current."));
    else {
      target.append(line("Model judgment", `${judgment.served_model || judgment.requested_model || "unknown model"} · builder ${judgment.builder_version} · ${judgment.status}`));
      target.append(line("Request fingerprint", judgment.request_fingerprint));
      target.append(line("Validation", judgment.response_validation?.ok ? "valid response" : `invalid: ${(judgment.response_validation?.errors || []).join(", ")}`));
      for (const question of judgment.questions) {
        const details = document.createElement("details"), questionTitle = document.createElement("summary");
        questionTitle.textContent = `${question.question_id} (${question.question_version}): ${question.judgment ? `${question.judgment.selected_answer} · ${percent(question.judgment.reported_confidence)} reported confidence` : "no answer"}`;
        details.append(questionTitle, line("Explicit target / scope", JSON.stringify(question.explicit_target)), line("Target provenance", question.target_provenance));
        if (question.judgment) details.append(line("Selected answer", question.judgment.selected_answer), line("Full probability distribution", JSON.stringify(question.judgment.probabilities)));
        const criteria = document.createElement("details"), criteriaTitle = document.createElement("summary"); criteriaTitle.textContent = "Question and allowed answers"; criteria.append(criteriaTitle, line("Instructions", question.instructions), json(question.criteria)); details.append(criteria);
        target.append(details);
      }
    }
    results.append(view);
  }
}
function competing(result) { if (!result) return "—"; const entries = Object.entries(result.probabilities || {}).filter(([choice]) => choice !== result.choice).sort(([, left], [, right]) => right - left); const [choice, probability] = entries[0] || []; return probability >= .2 ? `${choice} ${percent(probability)}` : "no substantial alternative"; }
function showCandidate(data) {
  candidateResults.replaceChildren();
  const heading = document.createElement("div"); heading.className = "candidate-heading"; const title = document.createElement("h2"); title.textContent = data.label || "No saved passage-candidate result";
  heading.append(title, line("Boundary", data.boundary || "No model result exists."));
  if (data.model) heading.append(line("Model", `${data.model.served} · ${data.model.usage.input_tokens} input / ${data.model.usage.output_tokens} output tokens · ${data.model.elapsed_ms} ms`), line("Fingerprint", data.model.request_fingerprint));
  const context = document.createElement("details"), contextTitle = document.createElement("summary"); contextTitle.textContent = "Selected source context — canonical evidence, not a Jev explanation"; context.append(contextTitle, json(data.source_context || [])); heading.append(context); candidateResults.append(heading);
  for (const unit of data.units || []) {
    const view = candidateTemplate.content.cloneNode(true); view.querySelector(".meta").textContent = `${unit.reference.book} ${unit.reference.chapter}:${unit.reference.verse} · awaiting human evidence review`;
    view.querySelector("h2").textContent = unit.proposition_id; view.querySelector(".statement").textContent = unit.statement; view.querySelector(".scope").textContent = unit.scope;
    view.querySelector(".candidate").textContent = `Jev candidate assessment: ${unit.candidate.choice} · ${percent(unit.candidate.probability)} · alternative: ${competing(unit.candidate)}`;
    view.querySelector(".details").textContent = `Depiction: ${unit.depiction.choice} (${percent(unit.depiction.probability)}) · Function: ${unit.communicative_function.choice} (${percent(unit.communicative_function.probability)}) · Speaker-relative time: ${unit.speaker_time.choice} (${percent(unit.speaker_time.probability)}) · Communication-setting time: ${unit.communication_time.choice} (${percent(unit.communication_time.probability)})`;
    candidateResults.append(view);
  }
}
function showVerification(data) {
  verificationResults.replaceChildren();
  const heading = document.createElement("div"); heading.className = "candidate-heading";
  const title = document.createElement("h2"); title.textContent = data.label || "1 Kings verification";
  heading.append(title, line("Boundary", data.boundary || "No saved result exists."));
  if (data.model) heading.append(line("Model", `${data.model.served} · ${data.model.usage.input_tokens} input / ${data.model.usage.output_tokens} output tokens · ${data.model.elapsed_ms} ms`), line("Fingerprint", data.model.request_fingerprint), line("Response validation", data.model.validation?.ok ? "valid" : `invalid: ${(data.model.validation?.errors || []).join(", ")}`));
  const context = document.createElement("details"), summary = document.createElement("summary"); summary.textContent = "1 Kings 13:1–3 source context — canonical evidence"; context.append(summary, json(data.source_context || [])); heading.append(context); verificationResults.append(heading);
  for (const item of data.cases || []) {
    const article = document.createElement("article"); article.className = "candidate-unit";
    const title = document.createElement("h2"); title.textContent = item.case_evidence?.target_label || item.case_id;
    const scope = document.createElement("p"); scope.textContent = `Scope: ${item.case_evidence?.governing_scope?.kind?.replaceAll("_", " ") || "—"}. ${item.case_evidence?.governing_scope?.note || ""}`;
    const result = document.createElement("p"); result.textContent = `Expected (local control): ${item.expected} · Observed Jev judgment: ${item.observed || "—"} · ${item.passed ? "PASS" : "FAIL"} · reported confidence: ${percent(item.reported_confidence)}`;
    const distributions = document.createElement("details"), distributionsTitle = document.createElement("summary"); distributionsTitle.textContent = "Full candidate distribution"; distributions.append(distributionsTitle, json(item.probabilities || {}));
    article.append(title, scope, result, distributions); verificationResults.append(article);
  }
}
function relationshipLabel(type) { return text(type).replace(/^proposed_/u, "proposed: ").replaceAll("_", " "); }
const relationshipGroup = judgment => ({ establishes_announcement_anchor: "Model-assessed announcement anchor", contributes_to_announcement_anchor: "Model-assessed contributing statements", surrounding_or_other_content: "Model-assessed surrounding content", relationship_underdetermined: "Model-assessed unresolved links" })[judgment?.selected_answer] || "Unassessed relationship";
function showRelationships(data) {
  relationshipResults.replaceChildren();
  const heading = document.createElement("div"); heading.className = "relationship-heading";
  const title = document.createElement("h2"); title.textContent = `Isaiah passage relationships — ${data.selected_discourse_window?.reference || "selected window"}`;
  heading.append(title, line("Boundary", data.evidence_boundary), line("Local validation", data.validation?.ok ? "valid; all links remain unassessed" : `invalid: ${(data.validation?.errors || []).join(", ")}`));
  const labelled = data.relationship_assessments?.labelled_pilot_v0_1 || data.relationship_assessment;
  const neutral = data.relationship_assessments?.neutral_followup_v0_2;
  if (labelled?.status === "saved_model_judgment") {
    const warning = document.createElement("p"); warning.className = "relationship-bias-warning"; warning.textContent = "Suggested relationship labels were included in the request; agreement is not independent validation.";
    heading.append(warning, line("Earlier labelled-pilot model", `${labelled.model.served} · ${labelled.model.usage.input_tokens} input / ${labelled.model.usage.output_tokens} output tokens · ${labelled.model.elapsed_ms} ms`), line("Earlier-pilot fingerprint", labelled.model.request_fingerprint), line("Earlier-pilot audit", labelled.payload_audit?.finding || "No payload audit available."));
  }
  if (neutral?.status === "saved_model_judgment") heading.append(line("Neutral v0.2 model", `${neutral.model.served} · ${neutral.model.usage.input_tokens} input / ${neutral.model.usage.output_tokens} output tokens · ${neutral.model.elapsed_ms} ms`), line("Neutral v0.2 fingerprint", neutral.model.request_fingerprint), line("Neutral-payload audit", neutral.payload_audit?.finding || "No payload audit available."));
  if (labelled?.frozen || neutral?.frozen) heading.append(line("Pilot status", "Frozen — no further tuning or model calls for this passage."));
  const window = document.createElement("details"), windowTitle = document.createElement("summary"); windowTitle.textContent = "Selected source-text window — canonical evidence"; window.append(windowTitle, json(data.source_window || [])); heading.append(window); relationshipResults.append(heading);
  const orderedGroups = ["Model-assessed announcement anchor", "Model-assessed contributing statements", "Model-assessed surrounding content", "Model-assessed unresolved links", "Unassessed relationship"];
  const entries = (data.relationships || []).map(item => {
    const id = `relationship:${item.source.proposition_id}:${item.target?.proposition_id || "window_anchor"}:assessment`;
    const current = neutral?.judgments?.[id] || labelled?.judgments?.[id] || null;
    return { item, labelled: labelled?.judgments?.[id] || null, neutral: neutral?.judgments?.[id] || null, judgment: current, group: relationshipGroup(current) };
  });
  for (const group of orderedGroups) {
    const members = entries.filter(entry => entry.group === group);
    if (!members.length) continue;
    const groupHeading = document.createElement("h2"); groupHeading.className = "relationship-group-heading"; groupHeading.textContent = group; relationshipResults.append(groupHeading);
    for (const { item, judgment, labelled: labelledJudgment, neutral: neutralJudgment } of members) {
    const article = document.createElement("article"); article.className = "relationship-unit";
    const title = document.createElement("h2"); title.textContent = relationshipLabel(item.relationship_type);
    const source = document.createElement("p"); source.className = "hebrew"; source.dir = "rtl"; source.textContent = item.source?.source_text || "—";
    const link = document.createElement("p"); link.className = "relationship-detail"; link.textContent = item.target ? `Linked statement: ${item.target.reference.book} ${item.target.reference.chapter}:${item.target.reference.verse} · ${item.target.source_text}` : "Linked statement: none — this is a proposed announcement anchor.";
    const scope = document.createElement("p"); scope.className = "relationship-detail"; scope.textContent = `Governing scope: ${item.governing_scope?.kind?.replaceAll("_", " ") || "—"} · Status: ${item.assessment_status}`;
    const uncertainty = document.createElement("p"); uncertainty.className = "relationship-uncertainty"; uncertainty.textContent = `Uncertainty: ${item.uncertainty}`;
    const comparison = document.createElement("div"); comparison.className = "relationship-comparison";
    const earlier = document.createElement("p"); earlier.className = "relationship-model"; earlier.textContent = labelledJudgment ? `Earlier labelled pilot: ${labelledJudgment.selected_answer} · ${percent(labelledJudgment.probabilities?.[labelledJudgment.selected_answer])}` : "Earlier labelled pilot: no saved assessment.";
    const current = document.createElement("p"); current.className = "relationship-model neutral"; current.textContent = neutralJudgment ? `Neutral v0.2: ${neutralJudgment.selected_answer} · ${percent(neutralJudgment.probabilities?.[neutralJudgment.selected_answer])}` : "Neutral v0.2: no saved assessment.";
    comparison.append(earlier, current);
    if (labelledJudgment && neutralJudgment && labelledJudgment.selected_answer !== neutralJudgment.selected_answer) { const changed = document.createElement("p"); changed.className = "relationship-changed"; changed.textContent = "Changed selected relationship in the neutral follow-up."; comparison.append(changed); }
    const distribution = document.createElement("details"), distributionTitle = document.createElement("summary"); distributionTitle.textContent = "Full Jev relationship distributions"; distribution.append(distributionTitle, json({ earlier_labelled_pilot: labelledJudgment?.probabilities || {}, neutral_v0_2: neutralJudgment?.probabilities || {} }));
    const audit = document.createElement("details"), auditTitle = document.createElement("summary"); auditTitle.textContent = "Source IDs and scope audit"; audit.append(auditTitle, json({ source_word_ids: item.source?.source_word_ids, target_word_ids: item.target?.source_word_ids || [], connection_source_ids: item.connection_source_ids, governing_scope: item.governing_scope }));
    if (judgment?.source_and_scope_review_required) { const review = document.createElement("p"); review.className = "relationship-review"; review.textContent = "Source-and-scope review required for Isaiah 53:7. This flag does not alter the saved Jev result."; article.append(review); }
    article.append(title, source, link, scope, uncertainty, comparison, distribution, audit); relationshipResults.append(article);
    }
  }
}
function show(data) {
  summary.textContent = `${data.clauses.length} MACULA CL nodes · ${data.propositions.length} canonical propositions · ${data.structural_nodes.length} structural nodes`;
  clauses.replaceChildren(...data.clauses.map(clause => {
    const view = template.content.cloneNode(true);
    view.querySelector("article").style.setProperty("--depth", clause.depth);
    view.querySelector(".meta").textContent = `Verse ${clause.verse} · ${clause.macula_node_id} · depth ${clause.depth}`;
    view.querySelector("h2").textContent = clause.macula_rule || "MACULA clause";
    view.querySelector(".lbf").textContent = `LBF: ${clause.lbf.text || "No LBF verse found"}`;
    view.querySelector(".hebrew").textContent = clause.macula.hebrew_text;
    view.querySelector(".gloss").textContent = clause.macula.english_gloss;
    view.querySelector(".relation").textContent = `Parent: ${clause.parent_clause_id || "top-level"} · Alignment: ${clause.alignment.status}`;
    return view;
  }));
  raw.textContent = JSON.stringify(data, null, 2);
}
async function extract(event) {
  event?.preventDefault();
  const values = new FormData(form), book = values.get("book"), chapter = values.get("chapter"), from = values.get("from"), to = values.get("to");
  summary.textContent = "Extracting…";
  const query = `book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(chapter)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const response = await fetch(`/api/analysis?${query}`), data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not extract the passage.");
  show(data);
  const resultResponse = await fetch(`/api/jev-results?${query}`), resultData = await resultResponse.json();
  if (!resultResponse.ok) throw new Error(resultData.error || "Could not load saved Jev results.");
  showJev(resultData);
  const candidateResponse = await fetch("/api/passage-candidate-results"), candidateData = await candidateResponse.json();
  if (!candidateResponse.ok) throw new Error(candidateData.error || "Could not load saved passage candidate results.");
  showCandidate(candidateData);
  const verificationResponse = await fetch("/api/one-kings-verification-results"), verificationData = await verificationResponse.json();
  if (!verificationResponse.ok) throw new Error(verificationData.error || "Could not load saved 1 Kings verification.");
  showVerification(verificationData);
  const relationshipsResponse = await fetch("/api/passage-relationships"), relationshipsData = await relationshipsResponse.json();
  if (!relationshipsResponse.ok) throw new Error(relationshipsData.error || "Could not load local passage relationships.");
  showRelationships(relationshipsData);
  await loadScan();
}
form.addEventListener("submit", event => extract(event).catch(error => { summary.textContent = error.message; }));
fetch("/api/books").then(response => response.json()).then(books => { document.querySelector("#book").replaceChildren(...books.map(book => new Option(book.spanish_name, book.name, book.name === "Isaiah", book.name === "Isaiah"))); return extract(); }).catch(error => { summary.textContent = error.message; });
