const form = document.querySelector("#range"), summary = document.querySelector("#summary"), clauses = document.querySelector("#clauses"), raw = document.querySelector("#json"), template = document.querySelector("#clause"), results = document.querySelector("#jev-results"), resultTemplate = document.querySelector("#jev-unit");
const candidateResults = document.querySelector("#candidate-results"), candidateTemplate = document.querySelector("#candidate-unit");
const verificationResults = document.querySelector("#verification-results");
const relationshipResults = document.querySelector("#relationship-results");
const scanResults = document.querySelector("#scan-results");
const humanReview = document.querySelector("#human-review");
const reviewState = { disposition: "candidate", review_status: "unreviewed", testament: "all", target_kind: "annotated_statement", limit: 10, offset: 0 };
const text = value => value === null || value === undefined || value === "" ? "—" : String(value);
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
function json(value) { const node = document.createElement("pre"); node.textContent = JSON.stringify(value, null, 2); return node; }
function line(label, value) { const item = document.createElement("p"), name = document.createElement("strong"); name.textContent = `${label}: `; item.append(name, document.createTextNode(text(value))); return item; }
function reviewerSelect(value, choices) { const select = document.createElement("select"); for (const [key, label] of choices) select.append(new Option(label, key, key === value, key === value)); return select; }
function selectedTextOffsets(container) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed || !container.contains(range.commonAncestorContainer)) return null;
  const before = range.cloneRange(); before.selectNodeContents(container); before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length, end = start + range.toString().length;
  return end > start ? { start, end } : null;
}
function setupReviewer() {
  humanReview.replaceChildren();
  const panel = document.createElement("div"); panel.className = "review-heading";
  const title = document.createElement("h2"); title.textContent = "Human review queue";
  const note = document.createElement("p"); note.textContent = "Review a small page at a time. Your decisions are stored separately from canonical linguistic evidence and Jev’s saved judgment.";
  const form = document.createElement("form"); form.className = "review-filters";
  const disposition = reviewerSelect(reviewState.disposition, [["candidate", "Model candidates"], ["review", "Model review items"], ["all", "All saved items"]]);
  const status = reviewerSelect(reviewState.review_status, [["unreviewed", "Not yet reviewed"], ["reviewed", "Already reviewed"], ["all", "All review states"]]);
  const testament = reviewerSelect(reviewState.testament, [["all", "OT and NT"], ["OT", "Old Testament"], ["NT", "New Testament"]]);
  const targetKind = reviewerSelect(reviewState.target_kind, [["annotated_statement", "Exact extracted phrases"], ["source_only_span", "Verse-level spans only"], ["all", "Both target kinds"]]);
  for (const [labelText, control] of [["Queue", disposition], ["Review state", status], ["Testament", testament], ["Target", targetKind]]) { const label = document.createElement("label"); label.textContent = labelText; label.append(control); form.append(label); }
  const load = document.createElement("button"); load.type = "submit"; load.textContent = "Load 10 statements"; form.append(load);
  form.addEventListener("submit", event => { event.preventDefault(); reviewState.disposition = disposition.value; reviewState.review_status = status.value; reviewState.testament = testament.value; reviewState.target_kind = targetKind.value; reviewState.offset = 0; loadReviewQueue(); });
  panel.append(title, note, form); humanReview.append(panel);
}
function displayReviewQueue(data) {
  setupReviewer();
  const panel = humanReview.querySelector(".review-heading");
  const targetMode = data.filters.target_kind === "annotated_statement" ? "Exact extracted source-language statements only." : data.filters.target_kind === "source_only_span" ? "Whole source verse/spans only; no phrase boundary was extracted." : "Both exact statements and whole source spans.";
  panel.append(line("Queue progress", `${data.summary.reviewed_statements.toLocaleString()} reviewed · ${data.summary.unreviewed_statements.toLocaleString()} remaining`), line("Matching statements", data.total_matching.toLocaleString()), line("Target mode", targetMode), line("Boundary", data.boundary));
  const decisionLabels = { retain_predictive_candidate: "Retain as predictive candidate", not_predictive_in_context: "Not predictive in this context", needs_broader_context: "Needs broader context", uncertain: "Remain uncertain" };
  const choices = Object.entries(decisionLabels);
  const list = document.createElement("div"); list.className = "review-list";
  if (!data.items.length) { const empty = document.createElement("p"); empty.className = "review-empty"; empty.textContent = "No statements match these filters."; list.append(empty); }
  for (const item of data.items) {
    const card = document.createElement("article"); card.className = "review-card";
    const title = document.createElement("h2"); title.textContent = `${item.verse_reference} · ${item.statement_id}`;
    const target = document.createElement("div"); target.className = "review-target";
    const targetLabel = document.createElement("p"); targetLabel.className = "review-target-label"; targetLabel.textContent = item.target_kind === "source_only_span" ? "Verse-level source span being reviewed — no extracted phrase boundary" : "Exact source-language statement being categorized";
    const source = document.createElement("p"); source.className = "review-source"; source.dir = item.testament === "OT" ? "rtl" : "ltr"; source.textContent = item.readable_text;
    target.append(targetLabel, source);
    const kind = document.createElement("p"); kind.className = "review-kind"; kind.textContent = `${item.target_kind.replaceAll("_", " ")} · model: ${item.assessment.replaceAll("_", " ")} (${percent(item.selected_probability)})`;
    const scope = item.grammatical_scope ? JSON.stringify(item.grammatical_scope) : "Unavailable for this source-only span.";
    card.append(title, target, kind, line("Scope", scope), line("Source IDs", item.source_references.join(", ")));
    if (item.macula_english_gloss?.status === "available") { const gloss = document.createElement("p"); gloss.className = "review-gloss"; gloss.textContent = item.macula_english_gloss.words.map(word => `${word.source} — ${word.gloss}`).join(" · "); card.append(line("MACULA English gloss", item.macula_english_gloss.label), gloss); }
    else card.append(line("MACULA English gloss", item.macula_english_gloss?.reason || "Unavailable."));
    if (item.spanish_reading?.status === "available") {
      const spanish = document.createElement("p"); spanish.className = "review-spanish";
      const highlight = item.spanish_highlight;
      if (highlight) { spanish.append(document.createTextNode(item.spanish_reading.text.slice(0, highlight.start))); const marked = document.createElement("mark"); marked.textContent = highlight.text; spanish.append(marked, document.createTextNode(item.spanish_reading.text.slice(highlight.end))); }
      else spanish.textContent = item.spanish_reading.text;
      const spanControls = document.createElement("div"); spanControls.className = "review-span-controls";
      const markSelection = document.createElement("button"); markSelection.type = "button"; markSelection.textContent = "Bold selected Spanish text";
      const saveSpan = async payload => { markSelection.disabled = true; markSelection.textContent = "Saving…"; try { const response = await fetch("/api/human-review-span", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statement_id: item.statement_id, ...payload }) }); const saved = await response.json(); if (!response.ok) throw new Error(saved.error || "Could not save the Spanish comparison span."); await loadReviewQueue(); } catch (error) { markSelection.disabled = false; markSelection.textContent = error.message; } };
      markSelection.addEventListener("click", () => { const offsets = selectedTextOffsets(spanish); if (!offsets) { markSelection.textContent = "Select Spanish words first"; return; } saveSpan(offsets); });
      spanControls.append(markSelection);
      if (highlight) { const clear = document.createElement("button"); clear.type = "button"; clear.className = "secondary"; clear.textContent = "Clear Spanish highlight"; clear.addEventListener("click", () => saveSpan({ clear: true })); spanControls.append(clear); }
      card.append(line("Full LBF verse context", item.spanish_reading.label), spanish, spanControls, line("Highlight note", "The bold span is selected by the reviewer for comparison; it is not verified source-to-Spanish alignment."));
    }
    else card.append(line("Full LBF verse context", item.spanish_reading?.reason || "Unavailable."));
    if (item.source_window_references?.length) card.append(line("Saved source window", item.source_window_references.join(", ")));
    if (item.mapping_limitations?.length) card.append(line("Annotation limitation", item.mapping_limitations.join("; ")));
    const model = document.createElement("details"), modelTitle = document.createElement("summary"); modelTitle.textContent = "Saved Jev distribution — model judgment, not source evidence"; model.append(modelTitle, json(item.distributions)); card.append(model);
    const decisionForm = document.createElement("form"); decisionForm.className = "review-decision";
    const decision = reviewerSelect(item.human_review?.decision || "", [["", "Choose your decision"], ...choices]);
    const note = document.createElement("textarea"); note.rows = 3; note.maxLength = 4000; note.placeholder = "Optional review note: source evidence, scope, or reason."; note.value = item.human_review?.note || "";
    const save = document.createElement("button"); save.type = "submit"; save.textContent = item.human_review ? "Update human review" : "Save human review";
    decisionForm.append(line("Human decision", ""), decision, note, save);
    if (item.human_review) decisionForm.append(line("Saved", item.human_review.reviewed_at));
    decisionForm.addEventListener("submit", async event => {
      event.preventDefault();
      if (!decision.value) { save.textContent = "Choose a decision first"; return; }
      save.disabled = true; save.textContent = "Saving…";
      try {
        const response = await fetch("/api/human-review-decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statement_id: item.statement_id, decision: decision.value, note: note.value }) });
        const saved = await response.json(); if (!response.ok) throw new Error(saved.error || "Could not save review.");
        await loadReviewQueue();
      } catch (error) { save.disabled = false; save.textContent = error.message; }
    });
    card.append(decisionForm); list.append(card);
  }
  humanReview.append(list);
  const pager = document.createElement("div"); pager.className = "review-pager";
  const previous = document.createElement("button"); previous.type = "button"; previous.textContent = "Previous 10"; previous.disabled = reviewState.offset === 0; previous.addEventListener("click", () => { reviewState.offset = Math.max(0, reviewState.offset - reviewState.limit); loadReviewQueue(); });
  const next = document.createElement("button"); next.type = "button"; next.textContent = "Next 10"; next.disabled = reviewState.offset + reviewState.limit >= data.total_matching; next.addEventListener("click", () => { reviewState.offset += reviewState.limit; loadReviewQueue(); });
  pager.append(previous, next); humanReview.append(pager);
}
async function loadReviewQueue() {
  const params = new URLSearchParams(reviewState);
  const response = await fetch(`/api/human-review-queue?${params}`), data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load the human review queue.");
  displayReviewQueue(data);
}
function showScan(data) {
  scanResults.replaceChildren();
  const heading = document.createElement("div"); heading.className = "scan-heading";
  const title = document.createElement("h2"); title.textContent = "Scripture-wide predictive-prophecy discovery";
  const live = data.live_status;
  const worker = live.worker || { state: "not_running" };
  const alert = live.worker_alert;
  const workerDetail = worker.state === "running" ? `running · ${worker.rounds_completed || 0} fair rounds · ${worker.min_interval_ms || 0} ms minimum interval` : `${worker.state.replaceAll("_", " ")}${worker.pause_reason ? ` · ${worker.pause_reason.replaceAll("_", " ")}` : ""}`;
  heading.append(title, line("Coverage", `${data.source_roster.verse_count.toLocaleString()} Protestant verses · ${live.label}`), line("Scope", data.coverage_boundary), line("Continuous worker", workerDetail), line("Annotated OT checkpoint", `${live.annotated_ot.completed_windows} completed windows · cursor ${live.annotated_ot.next_window_index ?? "—"} · last ${live.annotated_ot.last_checkpoint || "—"}`), line("Shared Jev budget", `$${live.spending.usd.toFixed(4)} of $${live.spending.cap_usd.toFixed(2)} · ${live.spending.input_tokens.toLocaleString()} input / ${live.spending.output_tokens.toLocaleString()} output tokens`), line("NT source-only", `${live.nt_source_only.assessed_spans || 0} assessed · ${live.nt_source_only.candidate || 0} candidate · ${live.nt_source_only.review || 0} review`), line("OT fallback source-only", `${live.ot_fallback_source_only.assessed_spans || 0} assessed · ${live.ot_fallback_source_only.candidate || 0} candidate · ${live.ot_fallback_source_only.review || 0} review`));
  const eligibleWorkExhausted = worker.state === "paused" && worker.pause_reason === "eligible_routes_exhausted";
  if (eligibleWorkExhausted) {
    const completion = document.createElement("div"); completion.className = "worker-alert";
    const completionTitle = document.createElement("h3"); completionTitle.textContent = "Eligible scan work complete";
    completion.append(completionTitle, line("Status", "All annotated, NT source-only, and fallback-eligible targets have saved assessments."), line("Blocked coverage", `${data.coverage_summary.unprocessed || 0} OT verses lack usable source text and remain visible for manual source recovery.`));
    heading.append(completion);
  } else if (worker.state === "paused" || worker.state === "paused_error") {
    const warning = document.createElement("div"); warning.className = "worker-alert";
    const alertTitle = document.createElement("h3"); alertTitle.textContent = "Scan paused — action needed";
    const resume = document.createElement("button"); resume.type = "button"; resume.textContent = "Resume scan"; resume.addEventListener("click", () => resumeWorker(resume));
    const acknowledge = document.createElement("button"); acknowledge.type = "button"; acknowledge.className = "secondary"; acknowledge.textContent = "Acknowledge"; acknowledge.addEventListener("click", () => acknowledgeWorker(acknowledge));
    const reason = worker.pause_reason || alert?.pause_reason || worker.error || "unknown";
    warning.append(alertTitle, line("Reason", String(reason).replaceAll("_", " ")), line("Paused", alert?.created_at || worker.updated_at), line("Notification", alert?.notification?.delivered ? "A macOS notification was delivered." : `Native notification unavailable: ${alert?.notification?.error || alert?.notification?.reason || "unknown"}`), resume, acknowledge);
    heading.append(warning);
  }
  const coverage = document.createElement("div"); coverage.className = "coverage-chips";
  for (const status of ["unprocessed", "processed", "candidate", "uncertain", "failed", "missing_or_unmapped_macula", "source_text_fallback_available", "source_text_fallback_unavailable"]) { const chip = document.createElement("span"); chip.textContent = `${status.replaceAll("_", " ")}: ${data.coverage_summary[status] || 0}`; coverage.append(chip); }
  heading.append(coverage);
  const details = document.createElement("details"), detailsTitle = document.createElement("summary"); detailsTitle.textContent = "Archived representative dry-run estimate"; details.append(detailsTitle, line("Requests", data.representative_batch.requests), line("Batch rough input", data.representative_batch.token_estimate.estimated_input_tokens), json(data.representative_batch.payload_breakdown)); heading.append(details);
  const exports = document.createElement("div"); exports.className = "scan-exports";
  const exportTitle = document.createElement("h3"); exportTitle.textContent = "Download the complete results";
  const exportNote = document.createElement("p"); exportNote.textContent = `${data.inventory_counts.candidate_statements.toLocaleString()} candidate statements and ${data.inventory_counts.review_statements.toLocaleString()} review items are kept out of this page so it opens quickly.`;
  const exportList = document.createElement("ul");
  for (const item of data.downloads) { const row = document.createElement("li"), link = document.createElement("a"); link.href = item.href; link.textContent = item.label; row.append(link, document.createTextNode(` (${item.format})`)); exportList.append(row); }
  exports.append(exportTitle, exportNote, exportList); heading.append(exports); scanResults.append(heading);
  if (data.coordinate_review) {
    const mapping = document.createElement("details"), mappingTitle = document.createElement("summary"), summary = data.coordinate_review.summary;
    mappingTitle.textContent = `Protestant-to-WLC coordinate review: ${summary.divergent_chapters} divergent chapters · manual verification required`;
    const blocked = (summary.currently_blocked_references || []).map(item => typeof item === "string" ? item : item.reference).join(", ") || "None";
    mapping.append(mappingTitle, line("Review targets", summary.review_targets), line("Currently blocked", summary.currently_blocked_targets), line("Status", "Non-operative: no coordinate proposal is used for extraction or inference."), line("Blocked references", blocked));
    const rules = document.createElement("ul"); for (const rule of data.coordinate_review.rules) { const item = document.createElement("li"); item.textContent = rule; rules.append(item); } mapping.append(rules); heading.append(mapping);
  }
  const note = document.createElement("p"); note.className = "scan-note"; note.textContent = `Review retention: ${data.inventory_policy?.review_queue || "material uncertainty is retained for human review."}`; scanResults.append(note);
}
async function resumeWorker(button) {
  button.disabled = true; button.textContent = "Starting…";
  try {
    const response = await fetch("/api/scan-worker/resume", { method: "POST" }), data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not start the worker.");
    button.textContent = "Started";
    setTimeout(() => loadScan().catch(() => {}), 800);
  } catch (error) { button.disabled = false; button.textContent = error.message; }
}
async function acknowledgeWorker(button) {
  button.disabled = true;
  const response = await fetch("/api/scan-worker/alert/acknowledge", { method: "POST" });
  if (response.ok) await loadScan(); else { button.disabled = false; button.textContent = "Could not acknowledge"; }
}
async function loadScan() { const response = await fetch("/api/candidate-scan"), data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load scan coverage."); showScan(data); }
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
fetch("/api/books").then(response => response.json()).then(books => { document.querySelector("#book").replaceChildren(...books.map(book => new Option(book.spanish_name, book.name, book.name === "Isaiah", book.name === "Isaiah"))); summary.textContent = "Choose a passage and select Extract clauses."; setupReviewer(); return loadScan(); }).catch(error => { summary.textContent = error.message; });
