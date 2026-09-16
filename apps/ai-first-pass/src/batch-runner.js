import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { BOOKS, findBook } from "./catalog.js";
import { translateChunk } from "./ollama.js";
import { readStatusRows } from "./project-status.js";
import { NEHEMIAH_GAP_BASIS, NEHEMIAH_GAP_REFERENCE, draftNehemiahGap } from "./source-gap.js";
import { loadBookSource } from "./source-loader.js";
import {
  readTranslationDocument,
  writeTranslationDocument
} from "./translation-document.js";

const execFileAsync = promisify(execFile);

function publicJob(job) {
  return {
    state: job.state,
    model: job.model,
    chunkSize: job.chunkSize,
    selectedBooks: job.selectedBooks,
    currentBook: job.currentBook,
    currentReference: job.currentReference,
    completedVerses: job.completedVerses,
    totalVerses: job.totalVerses,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    stopRequested: job.stopRequested,
    logs: job.logs.slice(-80)
  };
}

function log(job, message, level = "info") {
  job.logs.push({ at: new Date().toISOString(), level, message });
  if (job.logs.length > 300) job.logs.splice(0, job.logs.length - 300);
}

export class BatchRunner {
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
    this.job = this.blankJob();
  }

  blankJob() {
    return {
      state: "idle",
      model: "",
      chunkSize: 8,
      selectedBooks: [],
      currentBook: "",
      currentReference: "",
      completedVerses: 0,
      totalVerses: 0,
      startedAt: null,
      finishedAt: null,
      error: null,
      stopRequested: false,
      logs: []
    };
  }

  status() {
    return publicJob(this.job);
  }

  async scanBooks() {
    const statusRows = await readStatusRows(join(this.repoRoot, "STATUS.md"));
    return Promise.all(BOOKS.map(async book => {
      const source = await loadBookSource(this.repoRoot, book);
      const translationPath = join(this.repoRoot, "translation", book.testament, `${book.slug}.md`);
      const document = await readTranslationDocument(translationPath);
      const sourceReferences = new Set(source.map(verse => `${verse.chapter}:${verse.verse}`));
      const existing = [...document.verses.keys()].filter(reference => sourceReferences.has(reference)).length;
      const status = statusRows.get(book.slug)?.translation || "none";
      const missing = source.length - existing;
      const blockedVerses = source.filter(verse => verse.sourceUnavailable && !document.verses.has(`${verse.chapter}:${verse.verse}`)).length;
      const translatableMissingVerses = Math.max(0, missing - blockedVerses);
      return {
        ...book,
        status,
        sourceVerses: source.length,
        existingVerses: existing,
        missingVerses: Math.max(0, missing),
        translatableMissingVerses,
        blockedVerses,
        eligible: ["none", "draft"].includes(status) && translatableMissingVerses > 0,
        gapResolvable: ["none", "draft"].includes(status) && blockedVerses > 0,
        protected: ["ready", "done"].includes(status)
      };
    }));
  }

  async start({ model, books, chunkSize = 8, acknowledged = false }) {
    if (["running", "stopping"].includes(this.job.state)) {
      throw Object.assign(new Error("A first-pass job is already running."), { code: "JOB_RUNNING" });
    }
    if (acknowledged !== true) {
      throw Object.assign(new Error("Confirm that AI output is a draft requiring full human review."), { code: "CONFIRMATION_REQUIRED" });
    }
    const selected = [...new Set((Array.isArray(books) ? books : []).map(String))]
      .map(findBook)
      .filter(Boolean);
    if (!selected.length) throw new Error("Select at least one eligible book.");
    const size = Math.max(1, Math.min(20, Number(chunkSize) || 8));
    const scan = new Map((await this.scanBooks()).map(book => [book.slug, book]));
    const eligible = selected.filter(book => scan.get(book.slug)?.eligible);
    if (!eligible.length) throw new Error("The selected books have no missing draft verses. Ready and done books are protected.");

    this.job = {
      ...this.blankJob(),
      state: "running",
      model: String(model || "").trim(),
      chunkSize: size,
      selectedBooks: eligible.map(book => book.slug),
      totalVerses: eligible.reduce((sum, book) => sum + scan.get(book.slug).translatableMissingVerses, 0),
      startedAt: new Date().toISOString()
    };
    log(this.job, `Started source-first AI pass with ${this.job.model}; ${this.job.totalVerses} missing verses.`);
    void this.run(eligible);
    return this.status();
  }

  requestStop() {
    if (this.job.state !== "running") return this.status();
    this.job.stopRequested = true;
    this.job.state = "stopping";
    log(this.job, "Stop requested. The current Ollama request will finish before the job stops.", "warning");
    return this.status();
  }

  async resolveSourceGap({ book: slug, model, acknowledged = false, basis }) {
    if (["running", "stopping"].includes(this.job.state)) {
      throw Object.assign(new Error("A first-pass job is already running."), { code: "JOB_RUNNING" });
    }
    if (acknowledged !== true) {
      throw Object.assign(new Error("Confirm that Nehemiah 7:68 will be drafted from Ezra 2:66 OSHB, not invented Hebrew."), { code: "CONFIRMATION_REQUIRED" });
    }
    if (basis !== NEHEMIAH_GAP_BASIS) {
      throw Object.assign(new Error("The only allowed source-gap basis is Ezra 2:66 OSHB."), { code: "INVALID_GAP_BASIS" });
    }
    const book = findBook(slug);
    if (book?.slug !== "nehemias") {
      throw Object.assign(new Error("The only first-pass source gap is Protestant Nehemiah 7:68."), { code: "UNKNOWN_SOURCE_GAP" });
    }
    const scan = (await this.scanBooks()).find(item => item.slug === book.slug);
    if (scan?.protected) {
      throw Object.assign(new Error("Ready and done books are protected."), { code: "BOOK_PROTECTED" });
    }
    const source = await loadBookSource(this.repoRoot, book);
    const path = join(this.repoRoot, "translation", book.testament, `${book.slug}.md`);
    const existing = await readTranslationDocument(path);
    if (existing.verses.has(NEHEMIAH_GAP_REFERENCE)) {
      throw Object.assign(new Error("Nehemiah 7:68 already has Spanish. Existing verses are not replaced."), { code: "VERSE_EXISTS" });
    }
    const gap = source.find(verse => `${verse.chapter}:${verse.verse}` === NEHEMIAH_GAP_REFERENCE);
    const ezraPath = join(this.repoRoot, "translation", "ot", "esdras.md");
    const ezraDocument = await readTranslationDocument(ezraPath);
    const draft = draftNehemiahGap(gap, ezraDocument.verses.get("2:66"));
    let spanish = draft.spanish;
    if (!spanish) {
      if (!String(model || "").trim()) {
        throw Object.assign(new Error("Ezra 2:66 has no Spanish yet. Choose an Ollama model to draft Nehemiah 7:68 from that Hebrew."), { code: "MODEL_REQUIRED" });
      }
      const translated = await translateChunk({
        model: String(model).trim(),
        book,
        verses: [{
          chapter: 7,
          verse: 68,
          sourceText: draft.sourceText,
          morphology: draft.morphology
        }],
        previousSpanish: this.previousContext(
          source.findIndex(verse => `${verse.chapter}:${verse.verse}` === NEHEMIAH_GAP_REFERENCE),
          source,
          existing.verses
        )
      });
      spanish = translated.get(NEHEMIAH_GAP_REFERENCE);
    }
    const document = { ...existing, path };
    document.verses.set(NEHEMIAH_GAP_REFERENCE, spanish);
    await writeTranslationDocument(path, book, document.verses);
    await this.ensureDraftStatus(book, document.verses.size);
    this.job = {
      ...this.blankJob(),
      state: "complete",
      model: String(model || "").trim(),
      selectedBooks: [book.slug],
      completedVerses: 1,
      totalVerses: 1,
      currentBook: book.slug,
      currentReference: `${book.title} ${NEHEMIAH_GAP_REFERENCE}`,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString()
    };
    log(this.job, `${book.title} 7:68: drafted from Ezra 2:66 OSHB (${draft.origin}). Status remains draft.`);
    return this.status();
  }

  async ensureDraftStatus(book, existingCount) {
    if (existingCount <= 0) return;
    const rows = await readStatusRows(join(this.repoRoot, "STATUS.md"));
    if (rows.get(book.slug)?.translation !== "none") return;
    await execFileAsync("python3", [join(this.repoRoot, "tools", "verify.py"), book.slug], {
      cwd: this.repoRoot,
      maxBuffer: 1024 * 1024
    });
    const updated = await readStatusRows(join(this.repoRoot, "STATUS.md"));
    if (updated.get(book.slug)?.translation !== "draft") {
      throw new Error(`The canonical verifier did not record ${book.slug} as draft. Stopping before more AI text is written.`);
    }
    log(this.job, `${book.title}: canonical status is now draft.`);
  }

  previousContext(sourceIndex, source, verses) {
    return source.slice(Math.max(0, sourceIndex - 2), sourceIndex)
      .map(item => {
        const reference = `${item.chapter}:${item.verse}`;
        return { reference, spanish: verses.get(reference) || "" };
      })
      .filter(item => item.spanish);
  }

  async translateAndWrite(book, source, chunk, document, sourceStartIndex) {
    let result;
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        result = await translateChunk({
          model: this.job.model,
          book,
          verses: chunk,
          previousSpanish: this.previousContext(sourceStartIndex, source, document.verses)
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        log(this.job, `${book.title} ${chunk[0].chapter}:${chunk[0].verse}: attempt ${attempt} failed — ${error.message}`, "warning");
      }
    }
    if (lastError) {
      if (chunk.length > 1) {
        const midpoint = Math.ceil(chunk.length / 2);
        await this.translateAndWrite(book, source, chunk.slice(0, midpoint), document, sourceStartIndex);
        if (this.job.stopRequested) return;
        await this.translateAndWrite(book, source, chunk.slice(midpoint), document, sourceStartIndex + midpoint);
        return;
      }
      throw lastError;
    }

    let added = 0;
    for (const verse of chunk) {
      const reference = `${verse.chapter}:${verse.verse}`;
      if (document.verses.has(reference)) continue;
      document.verses.set(reference, result.get(reference));
      added += 1;
      this.job.completedVerses += 1;
      this.job.currentReference = `${book.title} ${reference}`;
      // A new book must be made draft while it is still incomplete. This is
      // the only status write, and it goes through the canonical verifier.
      if (document.verses.size === 1) {
        await writeTranslationDocument(document.path, book, document.verses);
        await this.ensureDraftStatus(book, 1);
      }
    }
    if (added) {
      await writeTranslationDocument(document.path, book, document.verses);
      log(this.job, `${book.title}: saved ${added} verse${added === 1 ? "" : "s"}; ${document.verses.size}/${source.length}.`);
    }
  }

  async runBook(book) {
    this.job.currentBook = book.slug;
    log(this.job, `${book.title}: loading ${book.textualBasis}.`);
    const source = await loadBookSource(this.repoRoot, book);
    const path = join(this.repoRoot, "translation", book.testament, `${book.slug}.md`);
    const existing = await readTranslationDocument(path);
    const document = { ...existing, path };
    await this.ensureDraftStatus(book, document.verses.size);

    const sourceGaps = source.filter(verse => verse.sourceUnavailable && !document.verses.has(`${verse.chapter}:${verse.verse}`));
    const missing = source.filter(verse => !verse.sourceUnavailable && !document.verses.has(`${verse.chapter}:${verse.verse}`));
    for (let offset = 0; offset < missing.length; offset += this.job.chunkSize) {
      if (this.job.stopRequested) return;
      const chunk = missing.slice(offset, offset + this.job.chunkSize);
      const sourceIndex = source.findIndex(item => item.chapter === chunk[0].chapter && item.verse === chunk[0].verse);
      this.job.currentReference = `${book.title} ${chunk[0].chapter}:${chunk[0].verse}`;
      await this.translateAndWrite(book, source, chunk, document, Math.max(0, sourceIndex));
    }
    if (!this.job.stopRequested) {
      log(this.job, sourceGaps.length
        ? `${book.title}: translatable source pass complete; ${sourceGaps.map(verse => `${verse.chapter}:${verse.verse}`).join(", ")} remains blocked because OSHB/WLC has no source text.`
        : `${book.title}: first pass complete; status remains draft for human review.`, sourceGaps.length ? "warning" : "info");
    }
  }

  async run(books) {
    try {
      for (const book of books) {
        if (this.job.stopRequested) break;
        await this.runBook(book);
      }
      this.job.state = this.job.stopRequested ? "stopped" : "complete";
      this.job.finishedAt = new Date().toISOString();
      log(this.job, this.job.stopRequested
        ? "Stopped safely. Run again to resume from the next missing verse."
        : "Selected first-pass work is complete. All AI-produced books still require human review.");
    } catch (error) {
      this.job.state = "error";
      this.job.error = { code: error.code || "BATCH_FAILED", message: error.message || "Batch job failed." };
      this.job.finishedAt = new Date().toISOString();
      log(this.job, this.job.error.message, "error");
    }
  }
}
