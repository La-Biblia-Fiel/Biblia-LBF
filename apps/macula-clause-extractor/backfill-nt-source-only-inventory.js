#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { inventoryDisposition } from "./src/candidate-scan.js";
const kind=process.env.SOURCE_ONLY_KIND||"nt";
const dir=`var/openrouter-jev-${kind}-source-only-v0.1.0`,out=`var/${kind}-source-only-inventory-v0.1.0.json`;
const index=JSON.parse(await readFile(`${dir}/index.json`,"utf8").catch(()=>'{"attempts":[]}'));
const entries=[];for(const attempt of index.attempts.filter(x=>x.status==="succeeded")){const r=JSON.parse(await readFile(`${dir}/${attempt.file}`,"utf8"));for(const [qid,a] of Object.entries(r.raw_response.answers||{})){const t=r.exact_api_request.state.targets[Number(qid.slice(1))];if(!t)continue;const d=inventoryDisposition(a);entries.push({stable_target_id:t.span_ids[0],reference:t.reference,target_kind:"source_only_span",annotation_status:"unavailable",source_text:t.source_text,span_ids:t.span_ids,assessment:a.choice,probability:a.probabilities[a.choice],probabilities:a.probabilities,disposition:d,request_fingerprint:r.request_fingerprint,record_file:attempt.file});}}
const unique=Object.values(Object.fromEntries(entries.map(x=>[x.stable_target_id,x])));for(const item of unique)if(kind==="nt"&&item.reference==="MAT.1.24")item.review_flags=["narrative_content_review: model-selected candidate preserved; inspect whether narration was confused with predictive content"];
const report={schema_version:"0.1.0",coverage:{assessed_spans:unique.length,candidate:unique.filter(x=>x.disposition==="candidate").length,review:unique.filter(x=>x.disposition==="review_queue"||x.review_flags?.length).length,processed:unique.filter(x=>x.disposition==="not_candidate").length},entries:unique};
await mkdir("var",{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+"\n");

// OT fallback judgments belong in the main OT coverage ledger as span
// assessments. This is idempotent and reads only already-saved responses.
if(kind==="ot-fallback"){
  const ledgerPath="var/candidate-scan-v0.1.0/ledger.json";
  const ledger=JSON.parse(await readFile(ledgerPath,"utf8"));
  const byReference=new Map(ledger.verses.map(verse=>[verse.reference,verse]));
  for(const item of unique){
    const verse=byReference.get(item.reference);if(!verse)continue;
    const statement={statement_id:item.stable_target_id,target_kind:"source_only_span",annotation_status:"annotation_unavailable",source_text:item.source_text,span_ids:item.span_ids,governing_scope:null,assessment:item.assessment,probability:item.probability,probabilities:item.probabilities,evidence_kind:"ot_fallback_source_only_v0_1",record_file:item.record_file,request_fingerprint:item.request_fingerprint,inventory_disposition:item.disposition};
    verse.statements=(verse.statements||[]).filter(existing=>!(existing.statement_id===statement.statement_id&&existing.evidence_kind===statement.evidence_kind));
    verse.statements.push(statement);
    verse.status=statement.inventory_disposition==="candidate"?"candidate":statement.inventory_disposition==="review_queue"?"uncertain":"processed";
    for(const field of ["candidates","review_queue"]){ledger[field]=(ledger[field]||[]).filter(existing=>!(existing.statement_id===statement.statement_id&&existing.evidence_kind===statement.evidence_kind));}
    const inventoryItem={reference:verse.reference,statement_id:statement.statement_id,target_kind:statement.target_kind,annotation_status:statement.annotation_status,source_text:statement.source_text,span_ids:statement.span_ids,governing_scope:null,classification:statement.assessment,probability:statement.probability,probabilities:statement.probabilities,evidence_kind:statement.evidence_kind,record_file:statement.record_file,request_fingerprint:statement.request_fingerprint,inventory_disposition:statement.inventory_disposition};
    if(statement.inventory_disposition==="candidate")ledger.candidates.push(inventoryItem);
    if(statement.inventory_disposition==="review_queue")ledger.review_queue.push({...inventoryItem,review_reason:"Source-only span assessment is retained for review when its selected category or distribution is materially uncertain."});
  }
  ledger.coverage_summary=Object.fromEntries(["unprocessed","processed","candidate","uncertain","failed"].map(status=>[status,ledger.verses.filter(verse=>verse.status===status).length]));
  ledger.coverage_summary.missing_or_unmapped_macula=ledger.verses.filter(verse=>verse.macula_annotation.status!=="available").length;
  ledger.coverage_summary.source_text_fallback_available=ledger.verses.filter(verse=>verse.source_text_fallback?.status==="available_direct_coordinate").length;
  ledger.coverage_summary.source_text_fallback_unavailable=ledger.coverage_summary.missing_or_unmapped_macula-ledger.coverage_summary.source_text_fallback_available;
  await writeFile(ledgerPath,JSON.stringify(ledger,null,2)+"\n");
}
console.log(JSON.stringify(report.coverage));
