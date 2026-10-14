#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { sourceOnlyTarget, validateSourceOnlyTarget } from "./src/annotation-transfer-gate.js";
const ledger=JSON.parse(await readFile("var/candidate-scan-v0.1.0/ledger.json","utf8"));
const fallback=ledger.verses.filter(v=>v.macula_annotation.status!=="available"&&v.source_text_fallback?.status==="available_direct_coordinate");
const checks=fallback.map(v=>{const words=(v.source_text_fallback.text||"").split(/\s+/u).filter(Boolean).map((surface,i)=>({id:`fallback:${v.verse_id}:${i+1}`,surface}));const target=sourceOnlyTarget({reference:v.reference,tokens:words,source:"OSHB/WLC fallback"});return {verse_id:v.verse_id,validation:validateSourceOnlyTarget(target),target};});
const report={eligible_fallback_verses:checks.length,blocked_without_source:ledger.verses.filter(v=>v.macula_annotation.status!=="available"&&v.source_text_fallback?.status!=="available_direct_coordinate").length,all_valid:checks.every(x=>x.validation.ok),checks};await writeFile("var/source-only-path-validation.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({eligible_fallback_verses:report.eligible_fallback_verses,blocked_without_source:report.blocked_without_source,all_valid:report.all_valid}));
