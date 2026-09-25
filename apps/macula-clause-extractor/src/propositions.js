const ROLE_NAMES = { S: "subject", O: "object", O2: "predicate_complement", PP: "prepositional_phrase", ADV: "adverbial", P: "predicate_complement" };
const sourceId = value => String(value || "").replace(/^o/u, "");

function targets(value = "") { return [...String(value).matchAll(/\d{12}/gu)].map(match => match[0]); }
function frameRoles(raw = "") {
  let activeRole = null;
  const grouped = [];
  for (const part of raw.split(";").map(item => item.trim()).filter(Boolean)) {
    const match = part.match(/^([^:]+):(.+)$/u);
    if (match) { activeRole = match[1]; grouped.push({ role: activeRole, targets: targets(match[2]) }); }
    else if (activeRole && /^\d{12}$/u.test(part)) grouped.at(-1).targets.push(part);
  }
  return grouped;
}
function ownConstituents(clause) { return (clause.constituents || []).filter(item => !item.contains_clause); }
function wordsIn(items) { return items.flatMap(item => item.words); }
function inSourceOrder(words) { return [...words].sort((a, b) => a.word_id.localeCompare(b.word_id, "en")); }
function coreference(word) { const target = word.subj_ref || word.ref; return target ? { source: word.subj_ref ? "SubjRef" : "Ref", target, target_ids: targets(target) } : null; }
function voice(word) { return /passive/iu.test(word.type || "") || ["niphal", "pual", "polal", "hophal"].includes(word.stem) ? "passive" : "active"; }

function predicateFor(clause) {
  const words = wordsIn(ownConstituents(clause).filter(item => item.category === "V"));
  const word = words.find(item => item.pos === "verb") || words[0];
  if (word) return { predicate_type: word.pos === "verb" ? "verbal" : "other", word };
  const complement = ownConstituents(clause).find(item => ["P", "ADJ"].includes(item.category));
  return complement ? { predicate_type: complement.category === "P" ? "prepositional" : "adjectival", word: complement.words[0] } : null;
}
function classification(clause) {
  const predicate = predicateFor(clause);
  if (predicate) return { analysis_unit_type: clause.parent_clause_id ? "embedded_proposition" : "proposition", derivation_status: "direct", predicate };
  if ((clause.constituents || []).some(item => item.contains_clause)) return { analysis_unit_type: "container", derivation_status: "derived", predicate: null };
  return { analysis_unit_type: "uncertain", derivation_status: "unresolved", predicate: null };
}
function referenceTargets(words) { return new Set(words.flatMap(word => [word.ref, word.subj_ref, word.frame].filter(Boolean).flatMap(value => [...String(value).matchAll(/(?:[A-Z]+:)?(\d{12})/gu)].map(match => match[1])))); }

/** Links a non-predicational sibling only when MACULA references one of its words. */
function linkedHelpers(clause, raw, classifications) {
  if (!clause.parent_clause_id) return [];
  const targets = referenceTargets(wordsIn(ownConstituents(clause)));
  if (!targets.size) return [];
  return raw.clauses.filter(candidate => candidate.parent_clause_id === clause.parent_clause_id && candidate.clause_id !== clause.clause_id && classifications.get(candidate.clause_id)?.analysis_unit_type === "uncertain" && wordsIn(ownConstituents(candidate)).some(word => targets.has(sourceId(word.word_id))));
}
function resolvedText(words, wordIndex, resolveBareReference = false) {
  const local = words.map(word => word.text).join(" ");
  const resolution = words.map(coreference).find(Boolean);
  const target = resolution?.target?.split(/\s+/u)[0];
  const resolved = target ? wordIndex.get(target) : null;
  return resolved && resolveBareReference ? { text: resolved.text, resolution: { ...resolution, target_word_id: resolved.word_id } } : { text: local, resolution };
}
function participant(word, role, predicateVoice) {
  const resolution = coreference(word);
  return { participant_id: resolution?.target_ids.length === 1 ? `macula:${resolution.target_ids[0]}` : `surface:${word.word_id}`, role, semantic_role: predicateVoice === "passive" && role === "subject" ? "patient" : role, source: resolution?.source || "surface", status: resolution ? "referenced" : "explicit", surface_word_id: word.word_id, resolution, features: Object.fromEntries(["person", "gender", "number"].filter(field => word[field]).map(field => [field, word[field]])) };
}
function phraseParticipant(item, role, predicateVoice, source = "syntax") {
  const component_references = item.words.flatMap(word => {
    const resolution = coreference(word);
    return resolution ? [{ word_id: word.word_id, resolution }] : [];
  });
  const phraseResolution = item.words.length === 1 ? component_references[0]?.resolution || null : null;
  const head = item.words.find(word => word.pos !== "suffix") || item.words[0];
  return { participant_id: `phrase:${item.source_node_id}`, role, semantic_role: predicateVoice === "passive" && role === "subject" ? "patient" : role, source, status: phraseResolution ? "referenced" : "explicit", surface_word_ids: item.words.map(word => word.word_id), text: item.words.map(word => word.text).join(" "), resolution: phraseResolution, component_references, features: Object.fromEntries(["person", "gender", "number"].filter(field => head[field]).map(field => [field, head[field]])) };
}
function participantsFor(items, predicate, predicateVoice) {
  const phraseSubjects = items.filter(item => item.category === "S").map(item => phraseParticipant(item, "subject", predicateVoice));
  const words = predicate.subj_ref ? [predicate] : [];
  const seen = new Set();
  return [...phraseSubjects, ...words.map(word => participant(word, "subject", predicateVoice))].filter(item => { const key = `${item.participant_id}:${item.surface_word_id || item.surface_word_ids.join(",")}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
function argumentFor(item, wordIndex) { const bare = item.words.length === 1 && ["suffix", "pronoun"].includes(item.words[0].pos); const resolved = resolvedText(item.words, wordIndex, bare); return { role: item.category || "unknown", argument_type: ROLE_NAMES[item.category] || "unknown", text: resolved.text, source_node_id: item.source_node_id, words: item.words.map(word => word.word_id), resolution: resolved.resolution }; }
function relationsFor(items, wordIndex) { return items.filter(item => item.category === "PP").map(item => { const preposition = item.words.find(word => word.pos === "preposition"), objectWords = item.words.filter(word => word !== preposition), resolved = resolvedText(objectWords, wordIndex, false); return { relation_type: "prepositional", preposition_lemma: preposition?.lemma || null, preposition_word_id: preposition?.word_id || null, object: { text: resolved.text, word_ids: objectWords.map(word => word.word_id), resolution: resolved.resolution }, semantic_role: null }; }); }
function scopedComplements(items, governingPredicate) { return items.filter(item => item.category === "O2").map(item => ({ text: item.words.map(word => word.text).join(" "), source_node_id: item.source_node_id, word_ids: item.words.map(word => word.word_id), scope: { relation: "predicate_complement", governing_predicate_word_id: governingPredicate.word_id }, predicates: item.words.filter(word => word.pos === "verb").map(word => ({ word_id: word.word_id, source_node_id: word.source_node_id, text: word.text, lemma: word.lemma, stem: word.stem, type: word.type, morphology: word.morphology, voice: voice(word), agent: null, resolution: coreference(word) })) })); }

function propositionFor(clause, info, raw, classifications, wordIndex) {
  const helpers = linkedHelpers(clause, raw, classifications);
  const directItems = ownConstituents(clause);
  const items = [...directItems, ...helpers.flatMap(ownConstituents)];
  const words = inSourceOrder(wordsIn(items));
  const predicate = info.predicate.word, predicateVoice = voice(predicate);
  const frames = [...new Set(words.map(word => word.frame).filter(Boolean))];
  const container = helpers.length ? raw.clauses.find(candidate => candidate.clause_id === clause.parent_clause_id) : null;
  const evidenceClauses = [clause, ...helpers, ...(container ? [container] : [])];
  const bookCode = clause.clause_id.match(/^(\D+)/u)?.[1] || "book";
  const passivePatients = predicateVoice === "passive" ? directItems.filter(item => item.category === "PP" && item.words.find(word => word.pos === "preposition")?.lemma === "לְ").map(item => ({ ...phraseParticipant(item, "unresolved", predicateVoice, "prepositional_phrase"), semantic_role: "unresolved" })) : [];
  return {
    proposition_id: `${bookCode}_${clause.chapter}_${String(clause.verse).padStart(2, "0")}_${clause.macula_node_id}_p1`,
    reference: { book: clause.book, chapter: clause.chapter, verse: clause.verse },
    source: { language: "hebrew", textual_base: "WLC/OSHB", text: words.map(word => word.text).join(" "), word_ids: words.map(word => word.word_id) },
    predicate: { predicate_type: info.predicate.predicate_type, word_id: predicate.word_id, source_node_id: predicate.source_node_id, text: predicate.text, ...Object.fromEntries(["lemma", "pos", "stem", "type", "morphology", "person", "gender", "number"].filter(field => predicate[field]).map(field => [field, predicate[field]])), voice: predicateVoice, agent: null, semantic_roles: frames.flatMap(frameRoles), frame_raw: frames },
    participants: [...participantsFor(directItems, predicate, predicateVoice), ...passivePatients],
    arguments: directItems.filter(item => !["V", "PP", "O2"].includes(item.category)).map(item => argumentFor(item, wordIndex)),
    relations: relationsFor(directItems, wordIndex),
    complements: scopedComplements(directItems, predicate),
    syntax: { rule: clause.macula_rule, category: "CL" }, source_nodes: evidenceClauses.map(item => item.macula_node_id), derivation_status: helpers.length ? "derived" : "direct", extraction_confidence: helpers.length || predicate.subj_ref ? "medium" : "high",
    evidence: { clause_ids: evidenceClauses.map(item => item.clause_id), macula_clause_nodes: evidenceClauses.map(item => item.macula_node_id), predicate_nodes: [predicate.source_node_id].filter(Boolean), word_ids: words.map(word => word.word_id), syntax_rule: clause.macula_rule, frame_raw: frames, resolutions: words.map(word => ({ word_id: word.word_id, resolution: coreference(word) })).filter(item => item.resolution) },
    provenance: { macula: clause.provenance }
  };
}

/** Builds source-backed semantic assertions from raw clause JSON, never LBF wording. */
export function buildPropositions(raw) {
  const classifications = new Map(raw.clauses.map(clause => [clause.clause_id, classification(clause)]));
  const wordIndex = new Map(raw.clauses.flatMap(clause => clause.macula.words).map(word => [sourceId(word.word_id), word]));
  const propositions = raw.clauses.map(clause => ({ clause, ...classifications.get(clause.clause_id) })).filter(item => ["proposition", "embedded_proposition"].includes(item.analysis_unit_type)).map(item => propositionFor(item.clause, item, raw, classifications, wordIndex));
  const structural_nodes = raw.clauses.map(clause => ({ clause, ...classifications.get(clause.clause_id) })).filter(item => ["container", "uncertain"].includes(item.analysis_unit_type)).map(item => ({ macula_node_id: item.clause.macula_node_id, clause_id: item.clause.clause_id, parent_clause_id: item.clause.parent_clause_id, analysis_unit_type: item.analysis_unit_type, derivation_status: item.derivation_status, child_clause_ids: raw.clauses.filter(clause => clause.parent_clause_id === item.clause.clause_id).map(clause => clause.clause_id), merged_into_proposition_ids: propositions.filter(proposition => proposition.evidence.clause_ids.includes(item.clause.clause_id)).map(proposition => proposition.proposition_id) }));
  return { schema_version: "0.3.0", passage: raw.passage, textual_authority: { testament: "OT", base: "WLC/OSHB" }, clauses: raw.clauses, propositions, structural_nodes, presentation: { lbf: { status: "pre_first_edition", verses: [...new Map(raw.clauses.map(clause => [clause.lbf.reference, clause.lbf])).values()] } }, provenance: { derived_from: "raw MACULA clause JSON", macula: raw.source.macula } };
}

/** Validates source traceability and reports invalid derivations without guessing. */
export function validatePropositions(raw, output) {
  const clauseIds = new Set(raw.clauses.map(clause => clause.clause_id)), nodeIds = new Set(raw.clauses.map(clause => clause.macula_node_id)), wordIds = new Set(raw.clauses.flatMap(clause => clause.macula.words.map(word => word.word_id))), errors = [], seen = new Set();
  for (const proposition of output.propositions) {
    if (!proposition.proposition_id || seen.has(proposition.proposition_id)) errors.push({ proposition_id: proposition.proposition_id, issue: "missing_or_duplicate_proposition_id" }); seen.add(proposition.proposition_id);
    if (!proposition.reference?.book || !wordIds.has(proposition.predicate?.word_id)) errors.push({ proposition_id: proposition.proposition_id, issue: "missing_or_invalid_predicate_evidence" });
    for (const id of proposition.evidence.clause_ids) if (!clauseIds.has(id)) errors.push({ proposition_id: proposition.proposition_id, issue: "unknown_clause_id", id });
    for (const id of proposition.source_nodes) if (!nodeIds.has(id)) errors.push({ proposition_id: proposition.proposition_id, issue: "unknown_macula_node_id", id });
    for (const id of proposition.evidence.word_ids) if (!wordIds.has(id)) errors.push({ proposition_id: proposition.proposition_id, issue: "unknown_word_id", id });
    for (const person of proposition.participants) for (const id of person.surface_word_ids || [person.surface_word_id]) if (!wordIds.has(id)) errors.push({ proposition_id: proposition.proposition_id, issue: "unknown_participant_word_id", id });
  }
  return { ok: errors.length === 0, errors };
}
