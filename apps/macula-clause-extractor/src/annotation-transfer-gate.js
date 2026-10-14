/** Conservative annotation gate: source text is always TR; MACULA is optional. */
export function sourceOnlyTarget({ reference, tokens, source = "TR1894", reason = "annotation_unavailable" }) {
  return { target_kind: "source_only_span", reference, source, span_ids: tokens.map(token => token.id), source_text: tokens.map(token => token.surface).join(" "), annotation_status: "annotation_unavailable", annotation_reason: reason, syntax: null, participants: null, governing_scope: null };
}
export const annotatedStatement = value => ({ target_kind: "annotated_statement", ...value });
/** A relation transfers only if every source token and relationship endpoint is aligned. */
export function transferable(annotation, alignedIds) {
  const required = [...(annotation.token_ids || []), ...(annotation.relationship_ids || [])];
  return required.length > 0 && required.every(id => alignedIds.has(id));
}
export function transferAnnotations(annotations, alignedIds) {
  const transferred = annotations.filter(item => transferable(item, alignedIds));
  return { transferred, omitted: annotations.filter(item => !transferable(item, alignedIds)).map(item => ({ id: item.id, reason: "required_token_or_relationship_not_aligned" })) };
}
export function validateSourceOnlyTarget(target) {
  const errors=[];
  if(target.annotation_status!=="annotation_unavailable") errors.push("missing_annotation_unavailable");
  if(target.target_kind!=="source_only_span") errors.push("wrong_target_kind");
  if(!target.reference||!target.source_text||!target.span_ids?.length) errors.push("missing_authoritative_source_evidence");
  if(target.syntax!==null||target.participants!==null||target.governing_scope!==null) errors.push("invented_annotation");
  return {ok:!errors.length,errors};
}
