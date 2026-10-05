const form = document.querySelector("#range"), summary = document.querySelector("#summary"), clauses = document.querySelector("#clauses"), raw = document.querySelector("#json"), template = document.querySelector("#clause"), results = document.querySelector("#jev-results"), resultTemplate = document.querySelector("#jev-unit");
const candidateResults = document.querySelector("#candidate-results"), candidateTemplate = document.querySelector("#candidate-unit");
const verificationResults = document.querySelector("#verification-results");
const relationshipResults = document.querySelector("#relationship-results");
const text = value => value === null || value === undefined || value === "" ? "—" : String(value);
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
function json(value) { const node = document.createElement("pre"); node.textContent = JSON.stringify(value, null, 2); return node; }
function line(label, value) { const item = document.createElement("p"), name = document.createElement("strong"); name.textContent = `${label}: `; item.append(name, document.createTextNode(text(value))); return item; }
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
function showRelationships(data) {
  relationshipResults.replaceChildren();
  const heading = document.createElement("div"); heading.className = "relationship-heading";
  const title = document.createElement("h2"); title.textContent = `Isaiah passage relationships — ${data.selected_discourse_window?.reference || "selected window"}`;
  heading.append(title, line("Boundary", data.evidence_boundary), line("Local validation", data.validation?.ok ? "valid; all links remain unassessed" : `invalid: ${(data.validation?.errors || []).join(", ")}`));
  const assessment = data.relationship_assessment;
  if (assessment?.status === "saved_model_judgment") heading.append(line("Jev boundary", assessment.boundary), line("Jev model", `${assessment.model.served} · ${assessment.model.usage.input_tokens} input / ${assessment.model.usage.output_tokens} output tokens · ${assessment.model.elapsed_ms} ms`), line("Jev request fingerprint", assessment.model.request_fingerprint), line("Jev response validation", assessment.model.validation?.ok ? "valid" : `invalid: ${(assessment.model.validation?.errors || []).join(", ")}`));
  else heading.append(line("Jev relationship assessment", "No saved result; no inference will be started."));
  const window = document.createElement("details"), windowTitle = document.createElement("summary"); windowTitle.textContent = "Selected source-text window — canonical evidence"; window.append(windowTitle, json(data.source_window || [])); heading.append(window); relationshipResults.append(heading);
  for (const item of data.relationships || []) {
    const article = document.createElement("article"); article.className = "relationship-unit";
    const title = document.createElement("h2"); title.textContent = relationshipLabel(item.relationship_type);
    const source = document.createElement("p"); source.className = "hebrew"; source.dir = "rtl"; source.textContent = item.source?.source_text || "—";
    const link = document.createElement("p"); link.className = "relationship-detail"; link.textContent = item.target ? `Linked statement: ${item.target.reference.book} ${item.target.reference.chapter}:${item.target.reference.verse} · ${item.target.source_text}` : "Linked statement: none — this is a proposed announcement anchor.";
    const scope = document.createElement("p"); scope.className = "relationship-detail"; scope.textContent = `Governing scope: ${item.governing_scope?.kind?.replaceAll("_", " ") || "—"} · Status: ${item.assessment_status}`;
    const uncertainty = document.createElement("p"); uncertainty.className = "relationship-uncertainty"; uncertainty.textContent = `Uncertainty: ${item.uncertainty}`;
    const relationshipId = `relationship:${item.source.proposition_id}:${item.relationship_type}:assessment`, judgment = assessment?.judgments?.[relationshipId];
    const model = document.createElement("p"); model.className = "relationship-model";
    model.textContent = judgment ? `Jev judgment: ${judgment.selected_answer} · ${percent(judgment.probabilities?.[judgment.selected_answer])} · ${judgment.agrees_with_local_proposal ? "agrees with local proposal" : "disagrees with local proposal"}` : "Jev judgment: no saved assessment.";
    const distribution = document.createElement("details"), distributionTitle = document.createElement("summary"); distributionTitle.textContent = "Full Jev relationship distribution"; distribution.append(distributionTitle, json(judgment?.probabilities || {}));
    const audit = document.createElement("details"), auditTitle = document.createElement("summary"); auditTitle.textContent = "Source IDs and scope audit"; audit.append(auditTitle, json({ source_word_ids: item.source?.source_word_ids, target_word_ids: item.target?.source_word_ids || [], connection_source_ids: item.connection_source_ids, governing_scope: item.governing_scope }));
    article.append(title, source, link, scope, uncertainty, model, distribution, audit); relationshipResults.append(article);
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
}
form.addEventListener("submit", event => extract(event).catch(error => { summary.textContent = error.message; }));
fetch("/api/books").then(response => response.json()).then(books => { document.querySelector("#book").replaceChildren(...books.map(book => new Option(book.spanish_name, book.name, book.name === "Isaiah", book.name === "Isaiah"))); return extract(); }).catch(error => { summary.textContent = error.message; });
