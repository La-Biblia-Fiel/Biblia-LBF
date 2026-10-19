#!/usr/bin/env node
/** Local-only sequential coverage plan; does not call a model. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const ledgerPath = join(appRoot, "var", "candidate-scan-v0.1.0", "ledger.json");
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
ledger.frozen_prompt_version = { version: ledger.scan_version, frozen_at: new Date().toISOString(), scope: "OT discovery template; no further paid calls are authorized by this planning step." };
const byId = new Map(ledger.verses.map(verse => [verse.verse_id, verse]));
const savedCursor = ledger.sequential_roster_cursor?.next_window_index ?? 0;
// A checkpoint batch, not a spending or authorization boundary. The runner
// persists after every window and later batches resume the same cursor.
const WINDOWS_PER_RUN = Number(process.env.JEV_WINDOWS_PER_RUN || 25);
if (!Number.isInteger(WINDOWS_PER_RUN) || WINDOWS_PER_RUN < 1) throw new Error("JEV_WINDOWS_PER_RUN must be a positive integer");
const eligibleTargets = window => window.verse_ids
  .map(id => byId.get(id))
  .filter(verse => verse?.status === "unprocessed" && verse.macula_annotation?.status === "available");
// A prior all-or-nothing planner could leave individual verses behind in a
// partly completed window. When the cursor reaches the end, make one ordered
// recovery pass over only those remaining annotated targets.
let recoveringIncompleteWindows = savedCursor >= ledger.windows.length;
const startIndex = recoveringIncompleteWindows ? 0 : savedCursor;
const plan = [];
let cursor = startIndex;
while (cursor < ledger.windows.length && plan.length < WINDOWS_PER_RUN) {
  const window = ledger.windows[cursor++];
  const verses = window.verse_ids.map(id => byId.get(id)).filter(Boolean);
  const targets = eligibleTargets(window);
  // Source context may include previously assessed verses, but the outgoing
  // request names only the still-unprocessed annotated targets. Missing MACULA
  // remains visible and is reserved for the source-only route.
  if (!verses.length || !targets.length) continue;
  plan.push({ window_id: window.window_id, book: window.book, chapter: window.chapter, first_verse: window.firstVerse, last_verse: window.lastVerse, verse_ids: window.verse_ids, target_verse_ids: targets.map(verse => verse.verse_id), target_verses: targets.map(verse => verse.verse) });
}
if (!plan.length && cursor >= ledger.windows.length && savedCursor > 0 && !recoveringIncompleteWindows) {
  recoveringIncompleteWindows = true;
  cursor = 0;
  while (cursor < ledger.windows.length && plan.length < WINDOWS_PER_RUN) {
    const window = ledger.windows[cursor++];
    const verses = window.verse_ids.map(id => byId.get(id)).filter(Boolean);
    const targets = eligibleTargets(window);
    if (!verses.length || !targets.length) continue;
    plan.push({ window_id: window.window_id, book: window.book, chapter: window.chapter, first_verse: window.firstVerse, last_verse: window.lastVerse, verse_ids: window.verse_ids, target_verse_ids: targets.map(verse => verse.verse_id), target_verses: targets.map(verse => verse.verse) });
  }
}
ledger.sequential_roster_cursor = {
  policy: "Future non-curated OT tranches select the next eligible unprocessed six-verse window from this saved roster cursor, then persist the cursor after every attempted window. They do not restart at opening verses or resample completed windows.",
  next_window_index: startIndex,
  proposed_after_completion_window_index: cursor,
  proposed_next_tranche: plan,
  recovery_of_incomplete_windows: recoveringIncompleteWindows,
  skipped_prior_windows: ledger.windows.slice(startIndex, cursor).filter(window => !plan.some(item => item.window_id === window.window_id)).map(window => window.window_id),
  generated_at: new Date().toISOString()
};
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(JSON.stringify(ledger.sequential_roster_cursor, null, 2));
