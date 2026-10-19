#!/usr/bin/env node
/** Read-only audit of Protestant/KJV coordinates against WLC's supplied map. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BOOKS } from "./src/books.js";
import { parseMaculaNodes } from "./src/extractor.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ledger = JSON.parse(await readFile(join(appRoot, "var/candidate-scan-v0.1.0/ledger.json"), "utf8"));
const mapPath = join(repoRoot, "source/hebrew/OSHB/morphhb/wlc/VerseMap.xml");
const mapXml = await readFile(mapPath, "utf8");
const osis = new Map([["Genesis","Gen"],["Exodus","Exod"],["Leviticus","Lev"],["Numbers","Num"],["Deuteronomy","Deut"],["Joshua","Josh"],["Judges","Judg"],["Ruth","Ruth"],["1 Samuel","1Sam"],["2 Samuel","2Sam"],["1 Kings","1Kgs"],["2 Kings","2Kgs"],["1 Chronicles","1Chr"],["2 Chronicles","2Chr"],["Ezra","Ezra"],["Nehemiah","Neh"],["Esther","Esth"],["Job","Job"],["Psalms","Ps"],["Proverbs","Prov"],["Ecclesiastes","Eccl"],["Song of Songs","Song"],["Isaiah","Isa"],["Jeremiah","Jer"],["Lamentations","Lam"],["Ezekiel","Ezek"],["Daniel","Dan"],["Hosea","Hos"],["Joel","Joel"],["Amos","Amos"],["Obadiah","Obad"],["Jonah","Jonah"],["Micah","Mic"],["Nahum","Nah"],["Habakkuk","Hab"],["Zephaniah","Zeph"],["Haggai","Hag"],["Zechariah","Zech"],["Malachi","Mal"]]);
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/gu)].map(([, k, v]) => [k, v]));
const mapEntries = [...mapXml.matchAll(/<verse\s+[^>]*\/>/gu)].map(([tag]) => attrs(tag)).filter(x => x.kjv && x.wlc && x.type);
const coordinateKey = value => String(value).replace(/![a-z]+$/iu, "");
const byKjv = new Map();
for (const entry of mapEntries) { const key = coordinateKey(entry.kjv); byKjv.set(key, [...(byKjv.get(key) || []), { wlc: entry.wlc, type: entry.type }]); }
const byWlc = new Map();
for (const entry of mapEntries) { const key = coordinateKey(entry.wlc); byWlc.set(key, [...(byWlc.get(key) || []), { kjv: entry.kjv, type: entry.type }]); }
const parseOsis = value => { const m = coordinateKey(value).match(/^(.+)\.(\d+)\.(\d+)$/u); return m && { book: m[1], chapter: Number(m[2]), verse: Number(m[3]) }; };
const textOf = root => { const leaves = node => !node.children?.length ? (node.attrs?.word ? [node] : []) : node.children.flatMap(leaves); return leaves(root).map(node => node.text.trim()).filter(Boolean).join(" "); };
const sourceCache = new Map();
async function sourceChapter(book, chapter) {
  const key = `${book.name}:${chapter}`; if (sourceCache.has(key)) return sourceCache.get(key);
  const relative = `WLC/nodes/${book.number}-${book.macula_code}-${String(chapter).padStart(3, "0")}.xml`;
  try {
    const sentences = parseMaculaNodes(await readFile(join(repoRoot, "source/hebrew/macula-hebrew-main", relative), "utf8"));
    const result = { file: `source/hebrew/macula-hebrew-main/${relative}`, coordinates: new Set(sentences.map(s => s.verse).filter(Boolean)), evidence: sentences.map(s => ({ coordinate: s.verse, source_text: textOf(s.root) })) };
    sourceCache.set(key, result); return result;
  } catch (error) { if (error.code !== "ENOENT") throw error; const result = { file: null, coordinates: new Set(), evidence: [] }; sourceCache.set(key, result); return result; }
}
const chapters = [];
for (const book of BOOKS) {
  const byChapter = new Map();
  for (const row of ledger.verses.filter(row => row.book === book.name)) byChapter.set(row.chapter, [...(byChapter.get(row.chapter) || []), row]);
  for (const [chapter, targets] of byChapter) {
    const direct = await sourceChapter(book, chapter);
    const expected = targets.map(row => row.verse), actual = [...direct.coordinates].map(value => Number(String(value).match(/:(\d+)$/u)?.[1])).filter(Number.isFinite);
    if (expected.length === actual.length && expected.every((value, index) => value === actual[index])) continue;
    const mappings = [];
    for (const target of targets) {
      const kjv = `${osis.get(book.name)}.${chapter}.${target.verse}`, candidates = byKjv.get(kjv) || [];
      if (candidates.length !== 1) {
        const directWlc = kjv, directMacula = `${book.macula_code.toUpperCase()} ${chapter}:${target.verse}`, directIsMappedElsewhere = byWlc.has(directWlc), directPresent = direct.coordinates.has(directMacula);
        mappings.push({ reference: target.reference, verse_id: target.verse_id, scan_status: target.status, kjv_coordinate: kjv, wlc_coordinate: directPresent ? directWlc : null, classification: !candidates.length && directPresent && !directIsMappedElsewhere ? "direct_coordinate_verified" : "mapping_defect_or_unresolved", reason: !candidates.length && directPresent && !directIsMappedElsewhere ? "No verse-map exception applies and the same WLC coordinate exists in local source; this target is not a versification difference." : candidates.length ? "The source map has multiple WLC targets." : "No safe direct correspondence is available from the source map and local WLC coordinates.", operative_mapping: null }); continue;
      }
      const candidate = candidates[0], wlc = parseOsis(candidate.wlc), wlcBook = BOOKS.find(item => osis.get(item.name) === wlc.book), source = wlcBook ? await sourceChapter(wlcBook, wlc.chapter) : { file: null, coordinates: new Set(), evidence: [] }, macula = wlcBook && `${wlcBook.macula_code.toUpperCase()} ${wlc.chapter}:${wlc.verse}`, present = Boolean(macula && source.coordinates.has(macula));
      const classification = !present ? "mapping_defect_or_unresolved" : candidate.type === "full" ? "legitimate_full_versification_difference" : candidate.type === "partial" ? "legitimate_partial_versification_difference" : "mapping_defect_or_unresolved";
      mappings.push({ reference: target.reference, verse_id: target.verse_id, scan_status: target.status, kjv_coordinate: kjv, wlc_coordinate: candidate.wlc, verse_map_type: candidate.type, classification, reason: classification === "legitimate_full_versification_difference" ? "OSHB VerseMap marks a full WLC↔KJV correspondence; this remains non-operative until structure transfer validates." : classification === "legitimate_partial_versification_difference" ? "OSHB VerseMap marks a partial overlap; whole-verse syntax transfer is unsupported." : "The referenced WLC coordinate was not found in the local MACULA source.", source_file: source.file, source_coordinate_evidence: source.evidence.filter(item => item.coordinate === macula), operative_mapping: null });
    }
    const totals = Object.fromEntries(["direct_coordinate_verified","legitimate_full_versification_difference","legitimate_partial_versification_difference","mapping_defect_or_unresolved"].map(type => [type, mappings.filter(item => item.classification === type).length]));
    chapters.push({ book: book.name, protestant_chapter: chapter, direct_coordinate_shape_matches: false, source_file: direct.file, classification: totals.mapping_defect_or_unresolved ? "contains_mapping_defect_or_unresolved" : totals.legitimate_partial_versification_difference ? "contains_partial_versification_difference" : "legitimate_versification_difference", classifications: totals, mappings, direct_source_coordinate_evidence: direct.evidence, operative_mapping: null });
  }
}
const all = chapters.flatMap(chapter => chapter.mappings), blocked = all.filter(item => item.scan_status === "unprocessed").map(item => ({ reference: item.reference, classification: item.classification, kjv_coordinate: item.kjv_coordinate, wlc_coordinate: item.wlc_coordinate || null })), count = type => all.filter(item => item.classification === type).length;
const report = { schema_version: "0.2.0", purpose: "Read-only coordinate audit. OSHB's supplied WLC↔KJV VerseMap is the authoritative reference used for coordinate classification; no entry is used for extraction or inference.", authoritative_reference: { path: "source/hebrew/OSHB/morphhb/wlc/VerseMap.xml", documented_relation: "WLC to KJV", map_entries: mapEntries.length }, rules: ["Project Protestant references remain authoritative.", "A full map entry establishes a coordinate correspondence, not permission to transfer syntax.", "A partial map entry never supports whole-verse structure transfer.", "Any future annotation transfer requires independent structural correspondence."], summary: { divergent_chapters: chapters.length, review_targets: all.length, direct_coordinates_verified: count("direct_coordinate_verified"), legitimate_full_versification_differences: count("legitimate_full_versification_difference"), legitimate_partial_versification_differences: count("legitimate_partial_versification_difference"), mapping_defects_or_unresolved: count("mapping_defect_or_unresolved"), currently_blocked_targets: blocked.length, currently_blocked_references: blocked }, chapters };
await mkdir(join(appRoot, "var"), { recursive: true }); await writeFile(join(appRoot, "var/protestant-coordinate-review-v0.1.0.json"), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report.summary));
