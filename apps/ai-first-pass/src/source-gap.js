export const NEHEMIAH_GAP_REFERENCE = "7:68";
export const NEHEMIAH_GAP_BASIS = "ezra-2-66-oshb";

const GAP_NOTE = "OSHB/WLC has no source text for Protestant Nehemiah 7:68 (WLC Neh 7:68 is Protestant 7:69). The in-repo parallel is Ezra 2:66 OSHB. Do not invent Hebrew.";

export function attachEzraParallel(nehemiahVerses, ezraVerses) {
  const gap = nehemiahVerses.find(verse => verse.chapter === 7 && verse.verse === 68);
  const ezra = ezraVerses.find(verse => verse.chapter === 2 && verse.verse === 66);
  if (!gap?.sourceUnavailable) return nehemiahVerses;
  if (!ezra?.sourceText) {
    gap.sourceNote = GAP_NOTE;
    return nehemiahVerses;
  }
  gap.parallelSource = {
    book: "esdras",
    reference: "2:66",
    sourceText: ezra.sourceText,
    morphology: ezra.morphology,
    sourceParts: ezra.sourceParts || ["2:66"]
  };
  gap.sourceNote = GAP_NOTE;
  return nehemiahVerses;
}

export function draftNehemiahGap(gap, ezraSpanish) {
  if (!gap?.sourceUnavailable || `${gap.chapter}:${gap.verse}` !== NEHEMIAH_GAP_REFERENCE) {
    throw Object.assign(new Error("The only first-pass source gap is Protestant Nehemiah 7:68."), { code: "UNKNOWN_SOURCE_GAP" });
  }
  if (!gap.parallelSource?.sourceText) {
    throw Object.assign(new Error("Ezra 2:66 OSHB is unavailable, so Nehemiah 7:68 still cannot be drafted."), { code: "PARALLEL_SOURCE_MISSING" });
  }
  const spanish = String(ezraSpanish || "").trim();
  if (spanish) {
    return { spanish, origin: "esdras-2-66-spanish" };
  }
  return {
    spanish: null,
    origin: "esdras-2-66-source",
    sourceText: gap.parallelSource.sourceText,
    morphology: `${gap.parallelSource.morphology}\n${GAP_NOTE}`
  };
}
