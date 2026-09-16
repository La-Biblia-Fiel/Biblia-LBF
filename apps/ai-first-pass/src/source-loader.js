import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { attachEzraParallel } from "./source-gap.js";

const entityMap = new Map([
  ["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", "\""], ["apos", "'"]
]);

function decodeXml(value) {
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (_, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return entityMap.get(entity) || `&${entity};`;
  });
}

function stripMarkup(value) {
  return decodeXml(String(value || "").replace(/<[^>]+>/gu, ""));
}

function cleanSourceText(value) {
  return String(value || "")
    .replace(/\s+([,.;·:!?׃])/gu, "$1")
    .replace(/\s*־\s*/gu, "־")
    .replace(/\s+/gu, " ")
    .trim();
}

export function parseOshbXml(xml, book) {
  const byReference = new Map();
  const versePattern = /<verse\b[^>]*osisID="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/giu;
  let verseMatch;
  while ((verseMatch = versePattern.exec(xml))) {
    const refMatch = verseMatch[1].match(new RegExp(`^${book.sourceCode}\\.(\\d+)\\.(\\d+)$`, "u"));
    if (!refMatch) continue;
    const mtChapter = Number(refMatch[1]);
    const mtVerse = Number(refMatch[2]);
    const block = verseMatch[2];
    let targetChapter = mtChapter;
    let targetVerse = mtVerse;
    const eventPattern = /<note\b[^>]*>([\s\S]*?)<\/note>|<w\b([^>]*)>([\s\S]*?)<\/w>/giu;
    let event;
    while ((event = eventPattern.exec(block))) {
      if (event[1] != null) {
        const noteText = stripMarkup(event[1]);
        const mapped = noteText.match(new RegExp(`\\bKJV:${book.sourceCode}\\.(\\d+)\\.(\\d+)(?:![ab])?\\b`, "iu"));
        if (mapped) {
          targetChapter = Number(mapped[1]);
          targetVerse = Number(mapped[2]);
        }
        continue;
      }
      const attributes = event[2] || "";
      const lemma = attributes.match(/\blemma="([^"]*)"/iu)?.[1] || "";
      const morph = attributes.match(/\bmorph="([^"]*)"/iu)?.[1] || "";
      const surface = cleanSourceText(stripMarkup(event[3]));
      if (!surface) continue;
      const key = `${targetChapter}:${targetVerse}`;
      if (!byReference.has(key)) {
        byReference.set(key, { chapter: targetChapter, verse: targetVerse, tokens: [], sourceParts: [] });
      }
      const target = byReference.get(key);
      target.tokens.push({ surface, lemma: decodeXml(lemma), morph: decodeXml(morph) });
      const sourcePart = `${mtChapter}:${mtVerse}`;
      if (!target.sourceParts.includes(sourcePart)) target.sourceParts.push(sourcePart);
    }
  }

  // The WLC omits Nehemiah 7:68 while the canonical LBF Protestant ledger
  // requires that label. Preserve the gap explicitly; never invent source text.
  if (book.slug === "nehemias" && !byReference.has("7:68")) {
    byReference.set("7:68", {
      chapter: 7,
      verse: 68,
      tokens: [],
      sourceParts: [],
      sourceUnavailable: true,
      sourceNote: "OSHB/WLC contains no source text for Protestant Nehemiah 7:68. Human textual-basis decision required."
    });
  }
  return [...byReference.values()].map(item => ({
    chapter: item.chapter,
    verse: item.verse,
    sourceText: cleanSourceText((item.tokens || []).map(token => token.surface).join(" ")),
    morphology: (item.tokens || []).map(token => `${token.surface} | ${token.lemma || "—"} | ${token.morph || "—"}`).join("\n"),
    sourceParts: item.sourceParts,
    sourceUnavailable: item.sourceUnavailable || false,
    sourceNote: item.sourceNote || "",
    parallelSource: item.parallelSource || null
  })).sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
}

export function parseTrText(text, book) {
  const verses = [];
  for (const line of String(text || "").replace(/\r\n/gu, "\n").split("\n").slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split("@");
    if (cells.length < 4) continue;
    const ref = cells[2]?.match(/^([^.]+)\.(\d+)\.(\d+)$/u);
    if (!ref || ref[1] !== book.sourceCode) continue;
    verses.push({
      chapter: Number(ref[2]),
      verse: Number(ref[3]),
      sourceText: cells.slice(3).join("@").trim(),
      morphology: ""
    });
  }
  return verses;
}

export function parseRobinsonMorph(text) {
  const byReference = new Map();
  let current = null;
  for (const rawLine of String(text || "").replace(/\r\n/gu, "\n").split("\n")) {
    const start = rawLine.match(/^\s*(\d+):(\d+)\s+(.*)$/u);
    if (start) {
      current = `${Number(start[1])}:${Number(start[2])}`;
      byReference.set(current, start[3].trim());
    } else if (current && rawLine.trim()) {
      byReference.set(current, `${byReference.get(current)} ${rawLine.trim()}`);
    }
  }
  return byReference;
}

export async function loadBookSource(repoRoot, book) {
  if (book.testament === "ot") {
    const xmlPath = join(repoRoot, "source", "hebrew", "OSHB", "morphhb", "wlc", book.sourceFile);
    const verses = parseOshbXml(await readFile(xmlPath, "utf8"), book);
    if (book.slug !== "nehemias") return verses;
    const ezraPath = join(repoRoot, "source", "hebrew", "OSHB", "morphhb", "wlc", "Ezra.xml");
    const ezraVerses = parseOshbXml(await readFile(ezraPath, "utf8"), {
      slug: "esdras",
      sourceCode: "Ezra"
    });
    return attachEzraParallel(verses, ezraVerses);
  }

  const [trText, morphText] = await Promise.all([
    readFile(join(repoRoot, "source", "greek", "TR1894", "tr1894.txt"), "utf8"),
    readFile(join(repoRoot, "source", "greek", "TR1894", "robinson-parsed", book.morphFile), "utf8")
  ]);
  const morphByReference = parseRobinsonMorph(morphText);
  const verses = parseTrText(trText, book).map(verse => ({
    ...verse,
    morphology: morphByReference.get(`${verse.chapter}:${verse.verse}`) || ""
  }));
  if (book.slug === "3juan") {
    const index = verses.findIndex(verse => verse.chapter === 1 && verse.verse === 14);
    const source = verses[index];
    const split = source?.sourceText.match(/^(.*?λαλήσομεν\.)\s*(.*)$/u);
    if (index >= 0 && split?.[1] && split?.[2]) {
      const note = "Robinson TR 1:14 spans Spanish Protestant 1:14–15.";
      verses.splice(index, 1,
        { ...source, sourceText: split[1].trim(), morphology: `${source.morphology}\n${note}` },
        { ...source, verse: 15, sourceText: split[2].trim(), morphology: `${source.morphology}\n${note}` }
      );
    }
  }
  return verses;
}
