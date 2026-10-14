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
const startIndex = ledger.sequential_roster_cursor?.next_window_index ?? 0;
// A checkpoint batch, not a spending or authorization boundary. The runner
// persists after every window and later batches resume the same cursor.
const WINDOWS_PER_RUN = 25;
const plan = [];
let cursor = startIndex;
while (cursor < ledger.windows.length && plan.length < WINDOWS_PER_RUN) {
  const window = ledger.windows[cursor++];
  const verses = window.verse_ids.map(id => byId.get(id)).filter(Boolean);
  if (!verses.length || verses.some(verse => verse.status !== "unprocessed")) continue;
  plan.push({ window_id: window.window_id, book: window.book, chapter: window.chapter, first_verse: window.firstVerse, last_verse: window.lastVerse, verse_ids: window.verse_ids });
}
ledger.sequential_roster_cursor = {
  policy: "Future non-curated OT tranches select the next eligible unprocessed six-verse window from this saved roster cursor, then persist the cursor after every attempted window. They do not restart at opening verses or resample completed windows.",
  next_window_index: startIndex,
  proposed_after_completion_window_index: cursor,
  proposed_next_tranche: plan,
  skipped_prior_windows: ledger.windows.slice(startIndex, cursor).filter(window => !plan.some(item => item.window_id === window.window_id)).map(window => window.window_id),
  generated_at: new Date().toISOString()
};
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(JSON.stringify(ledger.sequential_roster_cursor, null, 2));
