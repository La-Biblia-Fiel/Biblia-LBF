export function parseTranslationBook(content = "") {
  const matches = [...String(content).matchAll(/^###[ \t]+(\d+):(\d+)[ \t]*$/gmu)];
  return matches.map(match => {
    const start = match.index + match[0].length;
    const tail = String(content).slice(start);
    const nextHeading = tail.match(/^##(?:#)?\s+/mu);
    const end = nextHeading?.index != null ? start + nextHeading.index : String(content).length;
    const raw = String(content).slice(start, end);
    return {
      chapter: Number(match[1]),
      verse: Number(match[2]),
      text: raw.trim(),
      raw,
      headingStart: match.index,
      bodyStart: start,
      bodyEnd: end
    };
  });
}

export function replaceTranslationVerse(content, { chapter, verse, original, text }) {
  const row = parseTranslationBook(content).find(
    item => item.chapter === Number(chapter) && item.verse === Number(verse)
  );
  if (!row) throw new Error(`Verse ${chapter}:${verse} was not found.`);
  if (row.text !== String(original ?? "").trim()) {
    throw new Error("The verse changed on disk. Reload before saving your correction.");
  }
  const next = String(text ?? "").trim();
  if (!next) throw new Error("A verse cannot be saved empty.");
  return `${content.slice(0, row.bodyStart)}\n\n${next}\n\n${content.slice(row.bodyEnd).replace(/^\s*/u, "")}`;
}
