import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { findBook } from "./books.js";

const WORD_FIELDS = ["lemma", "morph", "pos", "stem", "type", "english", "gloss", "person", "gender", "number", "Ref", "SubjRef", "Frame"];
const REFERENCE_FIELDS = ["Ref", "SubjRef", "Frame"];

function decode(value = "") {
  return value.replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");
}

function attributes(source = "") {
  return Object.fromEntries([...source.matchAll(/([\w:-]+)=(['"])(.*?)\2/gu)].map(([, key, , value]) => [key, decode(value)]));
}

/** Parses the regular Sentence/Node/m subset used by MACULA WLC nodes. */
export function parseMaculaNodes(xml) {
  const sentences = [];
  const stack = [];
  let sentence;
  for (const token of String(xml).matchAll(/<(\/)?(Sentence|Node|m)\b([^>]*?)(\/?)>|([^<]+)/gu)) {
    if (token[5]) {
      if (stack.length) stack.at(-1).text += decode(token[5]);
      continue;
    }
    const closing = Boolean(token[1]);
    const tag = token[2];
    const selfClosing = token[4] === "/";
    if (!closing && tag === "Sentence") {
      sentence = { verse: attributes(token[3]).verse || "", root: null };
    } else if (!closing && tag === "Node") {
      const node = { attrs: attributes(token[3]), children: [], text: "" };
      if (stack.length) {
        node.parent = stack.at(-1);
        stack.at(-1).children.push(node);
      }
      else if (sentence) sentence.root = node;
      if (!selfClosing) stack.push(node);
    } else if (closing && tag === "Node") {
      stack.pop();
    } else if (!closing && tag === "m" && stack.length) {
      const word = { attrs: attributes(token[3]), children: [], text: "", parent: stack.at(-1) };
      stack.at(-1).children.push(word);
      if (!selfClosing) stack.push(word);
    } else if (closing && tag === "m") {
      stack.pop();
    } else if (closing && tag === "Sentence") {
      if (sentence?.root) sentences.push(sentence);
      sentence = undefined;
    }
  }
  return sentences;
}

function leaves(node) {
  if (!node.children.length) return node.attrs.word ? [node] : [];
  return node.children.flatMap(leaves);
}

function wordsFor(node) {
  return leaves(node).map(leaf => {
    const parent = leaf.parent?.attrs || {};
    const source = { ...parent, ...leaf.attrs };
    const output = {
      word_id: source["xml:id"] || parent.morphId || parent.nodeId,
      source_node_id: parent.nodeId || null,
      text: leaf.text.trim()
    };
    for (const field of WORD_FIELDS) {
      if (source[field] !== undefined && source[field] !== "") {
        const name = ({ morph: "morphology", Ref: "ref", SubjRef: "subj_ref", Frame: "frame" })[field] || field;
        output[name] = source[field];
      }
    }
    return output;
  });
}

function constituentsFor(node) {
  return node.children.filter(child => !child.attrs.word).map(child => ({
    category: child.attrs.Cat || null,
    rule: child.attrs.Rule || null,
    source_node_id: child.attrs.nodeId || null,
    contains_clause: child.attrs.Cat === "CL",
    words: wordsFor(child)
  }));
}

function compactSyntax(node) {
  const output = {};
  for (const key of ["Cat", "Rule", "Head", "nodeId"]) if (node.attrs[key] !== undefined) output[{ Cat: "category", Rule: "rule", Head: "head", nodeId: "macula_node_id" }[key]] = node.attrs[key];
  const children = node.children.filter(child => !child.attrs.word).map(compactSyntax);
  if (children.length) output.children = children;
  return output;
}

function verseNumber(reference) {
  const match = reference.match(/\s(\d+):(\d+)$/u);
  return match ? Number(match[2]) : null;
}

function collectClauses(node, context, parentClauseId = null, depth = 0, output = []) {
  const isClause = node.attrs.Cat === "CL";
  const id = isClause ? `${context.book_code}${context.chapter}_${context.verse}_${node.attrs.nodeId}` : parentClauseId;
  if (isClause) {
    const sourceWords = wordsFor(node);
    const references = Object.fromEntries(REFERENCE_FIELDS.map(field => [field, [...new Set(sourceWords.map(word => word[({ Ref: "ref", SubjRef: "subj_ref", Frame: "frame" })[field]]).filter(Boolean))]]).filter(([, values]) => values.length));
    output.push({
      clause_id: id,
      macula_node_id: node.attrs.nodeId,
      book: context.book,
      chapter: context.chapter,
      verse: context.verse,
      parent_clause_id: parentClauseId,
      depth,
      macula_rule: node.attrs.Rule || null,
      lbf: { reference: `${context.book} ${context.chapter}:${context.verse}`, text: context.lbfText || null },
      macula: { hebrew_text: sourceWords.map(word => word.text).join(" "), english_gloss: sourceWords.map(word => word.english || word.gloss).filter(Boolean).join(" "), words: sourceWords },
      constituents: constituentsFor(node),
      syntax: compactSyntax(node),
      references,
      alignment: { status: "not_checked", lbf_words: [], macula_words: sourceWords.map(word => word.word_id), unmatched_lbf_words: [], unmatched_macula_words: sourceWords.map(word => word.word_id) },
      provenance: { lbf_source: context.lbfFile, macula_source: "Clear-Bible/macula-hebrew", macula_dataset: "MACULA Hebrew", macula_file: context.maculaFile, macula_node_id: node.attrs.nodeId }
    });
  }
  for (const child of node.children) collectClauses(child, context, id, isClause ? depth + 1 : depth, output);
  return output;
}

export function lbfVerses(markdown, chapter, firstVerse, lastVerse) {
  const section = markdown.match(new RegExp(`## Capítulo ${chapter}\\s*([\\s\\S]*?)(?=\\n## Capítulo |$)`, "u"))?.[1] || "";
  const rows = new Map();
  for (const match of section.matchAll(/^###\s+(\d+):(\d+)\s*\n+([\s\S]*?)(?=\n###|$)/gmu)) {
    const verse = Number(match[2]);
    if (verse >= firstVerse && verse <= lastVerse) rows.set(verse, match[3].trim().replace(/\n+/gu, " "));
  }
  return rows;
}

export function extractPassage({ xml, lbfMarkdown, book = "Isaiah", bookCode = "isa", chapter, firstVerse, lastVerse, maculaFile = "WLC/nodes/23-Isa-053.xml", lbfFile = "translation/ot/isaias.md" }) {
  const verses = lbfVerses(lbfMarkdown, chapter, firstVerse, lastVerse);
  const clauses = [];
  for (const sentence of parseMaculaNodes(xml)) {
    const verse = verseNumber(sentence.verse);
    if (verse === null || verse < firstVerse || verse > lastVerse) continue;
    collectClauses(sentence.root, { book, book_code: bookCode, chapter, verse, lbfText: verses.get(verse), maculaFile, lbfFile }, null, 0, clauses);
  }
  return {
    schema_version: "0.1.0",
    passage: { book, chapter, verse_start: firstVerse, verse_end: lastVerse },
    source: { lbf: lbfFile, macula: "Clear-Bible/macula-hebrew WLC/nodes" },
    clauses
  };
}

export async function loadIsaiahPassage(repoRoot, firstVerse = 4, lastVerse = 6) {
  return loadPassage(repoRoot, { book: "Isaiah", chapter: 53, firstVerse, lastVerse });
}

export async function loadPassage(repoRoot, { book, chapter, firstVerse, lastVerse }) {
  const selected = findBook(book);
  if (!selected) throw new Error("Choose a supported Protestant Old Testament book.");
  if (![chapter, firstVerse, lastVerse].every(Number.isInteger) || chapter < 1 || firstVerse < 1 || lastVerse < firstVerse) throw new Error("Choose a valid chapter and verse range.");
  const paddedChapter = String(chapter).padStart(3, "0");
  const relativeFile = `WLC/nodes/${selected.number}-${selected.macula_code}-${paddedChapter}.xml`;
  const maculaPath = join(repoRoot, "source/hebrew/macula-hebrew-main", relativeFile);
  const lbfPath = join(repoRoot, "translation/ot", `${selected.translation_slug}.md`);
  const [xml, lbfMarkdown] = await Promise.all([readFile(maculaPath, "utf8"), readFile(lbfPath, "utf8")]);
  return extractPassage({ xml, lbfMarkdown, book: selected.name, bookCode: selected.macula_code.toLowerCase(), chapter, firstVerse, lastVerse, maculaFile: relativeFile, lbfFile: `translation/ot/${selected.translation_slug}.md` });
}
