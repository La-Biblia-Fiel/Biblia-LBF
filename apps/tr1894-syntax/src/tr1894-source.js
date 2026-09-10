import { readFile } from "node:fs/promises";
import { join } from "node:path";

const punctuation = /^[,.;·:!?]+$/u;

export function parseTr1894(text) {
  const verses = new Map();
  for (const line of String(text).replace(/\r\n/gu, "\n").split("\n").slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split("@", 4);
    if (cells.length !== 4 || !/^MAT\.\d+\.\d+$/u.test(cells[2])) continue;
    verses.set(cells[2], cells[3]);
  }
  return verses;
}

export function tokenizeTrVerse(reference, text) {
  const pieces = String(text).match(/\S+\s*/gu) || [];
  return pieces.map((piece, index) => {
    const whitespace = piece.match(/\s*$/u)?.[0] || "";
    const compact = piece.slice(0, piece.length - whitespace.length);
    const marks = compact.match(/[,.;·:!?]+$/u)?.[0] || "";
    const surface = compact.slice(0, compact.length - marks.length) || compact;
    return {
      token_id: `${reference}.w${String(index + 1).padStart(3, "0")}`,
      source_ref: reference,
      source_ordinal: index + 1,
      surface_source: surface,
      after: `${marks}${whitespace}`
    };
  });
}

export function parseUtr(text) {
  const byReference = new Map();
  let current;
  for (const line of String(text).replace(/\r\n/gu, "\n").split("\n")) {
    const start = line.match(/^(\d+):(\d+)\s+(.*)$/u);
    if (start) {
      current = `MAT.${Number(start[1])}.${Number(start[2])}`;
      byReference.set(current, start[3]);
    } else if (current && /^\s+/u.test(line)) {
      byReference.set(current, `${byReference.get(current)} ${line.trim()}`);
    }
  }
  return new Map([...byReference].map(([reference, row]) => [reference,
    [...row.matchAll(/([^\s{}|]+)(?:\s+\d+)+(?:\s+\{([^}]+)\})/gu)].map((match, index) => ({
      ordinal: index + 1,
      surface_beta: match[1],
      raw_tag: match[2]
    }))
  ]));
}

export function passageRows(verses, utr, chapter, firstVerse, lastVerse) {
  const rows = [];
  for (let verse = firstVerse; verse <= lastVerse; verse += 1) {
    const reference = `MAT.${chapter}.${verse}`;
    const text = verses.get(reference);
    if (!text) continue;
    rows.push({
      reference,
      text,
      tokens: tokenizeTrVerse(reference, text),
      utr: utr.get(reference) || []
    });
  }
  return rows;
}

export async function loadMatthewPassage(repoRoot, chapter, firstVerse, lastVerse) {
  const [trText, utrText] = await Promise.all([
    readFile(join(repoRoot, "source", "greek", "TR1894", "tr1894.txt"), "utf8"),
    readFile(join(repoRoot, "source", "greek", "TR1894", "robinson-parsed", "MT.UTR"), "utf8")
  ]);
  return passageRows(parseTr1894(trText), parseUtr(utrText), chapter, firstVerse, lastVerse);
}

export function sourcePrompt(rows) {
  return rows.map(row => [
    `${row.reference}: ${row.text}`,
    `TR terminals: ${row.tokens.map(token => `${token.token_id}=${token.surface_source}`).join(" | ")}`,
    `Robinson helper evidence: ${row.utr.map(token => `${token.ordinal}:${token.surface_beta}{${token.raw_tag}}`).join(" ")}`
  ].join("\n")).join("\n\n");
}

export { punctuation };
