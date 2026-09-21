function normalizeReference(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\./gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function isHumanConfirmedLink(entry = {}) {
  return ["hand", "manual", "manual-realign"].includes(String(entry.status || ""));
}

export function isHandUnit(unit = {}) {
  return ["hand", "manual", "manual-realign"].includes(String(unit.method || ""));
}

export function mapReverseLinksByTranslationPhrase(translationPhrases = [], links = []) {
  const phraseIndexesByReference = new Map();
  translationPhrases.forEach((phrase, index) => {
    const reference = normalizeReference(phrase.reference);
    if (!phraseIndexesByReference.has(reference)) phraseIndexesByReference.set(reference, []);
    phraseIndexesByReference.get(reference).push(index);
  });

  const result = new Map();
  const nextOrdinalByReference = new Map();
  for (const entry of links) {
    const reference = normalizeReference(entry.reference);
    const ordinal = nextOrdinalByReference.get(reference) || 0;
    nextOrdinalByReference.set(reference, ordinal + 1);
    const translationIndex = phraseIndexesByReference.get(reference)?.[ordinal];
    if (!Number.isInteger(translationIndex)) continue;
    result.set(translationIndex, { ...entry, _translationPhraseIndex: translationIndex });
  }
  return result;
}

export function pendingAlignmentWorkItems(reverseLinksByPhrase = new Map()) {
  return [...reverseLinksByPhrase.values()]
    .flatMap(entry => (entry.units || [])
      .filter(unit => !isHumanConfirmedLink(entry) || !isHandUnit(unit))
      .map(unit => ({ entry, unit, phraseIndex: Number(entry._translationPhraseIndex) })))
    .filter(item => Number.isInteger(item.phraseIndex))
    .sort((a, b) => a.phraseIndex - b.phraseIndex);
}
