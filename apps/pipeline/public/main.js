const bookSelect = document.querySelector("#book");
const chapterInput = document.querySelector("#chapter");
const verseInput = document.querySelector("#verse");
const loadButton = document.querySelector("#load");
const runChapterButton = document.querySelector("#run-chapter");
const keysEl = document.querySelector("#keys");
const statusEl = document.querySelector("#status");
const queueEl = document.querySelector("#queue");
const queueSummaryEl = document.querySelector("#queue-summary");
const queueHoldsEl = document.querySelector("#queue-holds");
const queueHoldsLabelEl = document.querySelector("#queue-holds-label");
const queueErrorsEl = document.querySelector("#queue-errors");
const queueErrorsLabelEl = document.querySelector("#queue-errors-label");
const workEl = document.querySelector("#work");
const workTitleEl = document.querySelector("#work-title");
const workHintEl = document.querySelector("#work-hint");
const packetEl = document.querySelector(".packet");
const referenceEl = document.querySelector("#reference");
const basisEl = document.querySelector("#basis");
const tokensEl = document.querySelector("#tokens");

const WORK = {
  draft: {
    title: "GPT is drafting",
    hint: "Traduce · source-faithful Spanish. Often 30–90 seconds.",
  },
  "audit-draft": {
    title: "Grok is verifying the draft",
    hint: "Source fidelity, token by token. This can take a minute.",
  },
  polish: {
    title: "Sonnet is polishing",
    hint: "Pulir · grammar only. Meaning must not move.",
  },
  "audit-polish": {
    title: "Grok is checking for drift",
    hint: "Compares the polish against the passed draft.",
  },
  chapter: {
    title: "Chapter pass-through",
    hint: "GPT → Grok. Sonnet only if Grok warns. Lint fails park with no Grok call.",
  },
};

let state = null;
let queue = null;
let busyKind = null;
let busyStarted = 0;
let busyTimer = 0;
let chapterPoll = 0;

function coords() {
  return {
    book: bookSelect.value,
    chapter: Number(chapterInput.value),
    verse: Number(verseInput.value),
  };
}

function elapsedLabel(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", Boolean(isError));
}

function renderBusy() {
  const running = Boolean(busyKind);
  document.body.classList.toggle("is-waiting", running);
  workEl.hidden = !running;
  loadButton.disabled = running;
  runChapterButton.disabled = running;

  if (running) {
    const spec = WORK[busyKind] || { title: "Working", hint: "" };
    const clock = elapsedLabel(Date.now() - busyStarted);
    workTitleEl.textContent = `${spec.title} · ${clock}`;
    workHintEl.textContent = spec.hint;
    workEl.setAttribute("role", "status");
    workEl.setAttribute("aria-live", "polite");
  }

  document.querySelectorAll(".station").forEach((station) => {
    const kind = station.dataset.station;
    station.classList.toggle("is-busy", running && kind === busyKind);
    station.toggleAttribute("aria-busy", running && kind === busyKind);
  });

  document.querySelectorAll("[data-run]").forEach((button) => {
    const kind = button.dataset.run;
    const idle = button.dataset.idle || button.textContent;
    if (running && kind === busyKind) {
      button.textContent = `Working · ${elapsedLabel(Date.now() - busyStarted)}`;
      button.disabled = true;
    } else {
      button.textContent = idle;
    }
  });
}

function setBusy(kind) {
  busyKind = kind;
  busyStarted = Date.now();
  setStatus("");
  renderBusy();
  clearInterval(busyTimer);
  busyTimer = setInterval(renderBusy, 250);
}

function clearBusy() {
  busyKind = null;
  clearInterval(busyTimer);
  busyTimer = 0;
  renderBusy();
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

const STAGE = {
  lint: "Lint",
  "audit-draft": "Grok draft",
  "audit-polish": "Grok polish",
  polish: "Sonnet",
};

function verseRanges(nums) {
  const sorted = [...new Set(nums.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!sorted.length) return "";
  const parts = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}–${prev}`);
    start = prev = n;
  }
  return parts.join(", ");
}

function shortError(raw) {
  const text = String(raw || "").trim();
  try {
    const parsed = JSON.parse(text);
    const inner = parsed && parsed.error;
    if (inner && inner.message) return inner.message;
    if (parsed && parsed.message) return parsed.message;
  } catch (_error) {
    /* keep raw */
  }
  return text;
}

function appendFinding(target, item) {
  const li = document.createElement("li");
  const head = document.createElement("p");
  head.className = "finding-head";
  head.textContent = `${item.severity || "fail"}: ${item.issue || "unspecified"}`;
  li.append(head);
  if (item.spanishSpan) {
    const span = document.createElement("p");
    span.className = "finding-span";
    span.textContent = `Spanish: ${item.spanishSpan}`;
    li.append(span);
  }
  const ids = item.sourceTokenIds || [];
  if (ids.length) {
    const tokens = document.createElement("p");
    tokens.className = "finding-ids";
    tokens.textContent = `Tokens: ${ids.join(", ")}`;
    li.append(tokens);
  }
  target.append(li);
}

function findingsList(target, audit) {
  target.innerHTML = "";
  if (!audit) return;
  for (const item of audit.findings || []) {
    appendFinding(target, item);
  }
}

function paint() {
  if (!state) return;
  packetEl.hidden = false;
  referenceEl.textContent = state.reference;
  basisEl.textContent = `${state.textualBasis} · ${state.tokens.length} tokens`;
  tokensEl.innerHTML = "";
  for (const token of state.tokens) {
    const div = document.createElement("div");
    div.className = "token";
    div.innerHTML = `<strong>${token.surface || ""}</strong><span>${token.strongs || ""} · ${token.morphExpanded || token.morph || ""}</span>`;
    tokensEl.append(div);
  }

  document.querySelector("#draft-text").textContent = state.draft?.spanish || "—";
  document.querySelector("#polish-text").textContent = state.polish?.spanish || "—";

  const draftVerdict = document.querySelector("#draft-verdict");
  const polishVerdict = document.querySelector("#polish-verdict");
  draftVerdict.textContent = state.draftAudit?.verdict || "—";
  polishVerdict.textContent = state.polishAudit?.verdict || "—";
  draftVerdict.className = `verdict ${state.draftAudit?.verdict || ""}`;
  polishVerdict.className = `verdict ${state.polishAudit?.verdict || ""}`;
  findingsList(document.querySelector("#draft-findings"), state.draftAudit);
  findingsList(document.querySelector("#polish-findings"), state.polishAudit);

  const gates = state.gates || {};
  const running = Boolean(busyKind);
  document.querySelector("[data-run=draft]").disabled = running;
  document.querySelector("[data-run=audit-draft]").disabled = running || !gates.canAuditDraft;
  document.querySelector("[data-run=polish]").disabled = running || !gates.canPolish;
  document.querySelector("[data-run=audit-polish]").disabled = running || !gates.canAuditPolish;

  document.querySelector("[data-station=draft]").classList.toggle("is-ready", Boolean(state.draft));
  document.querySelector("[data-station=audit-draft]").className =
    `station${state.draftAudit?.verdict === "pass" ? " is-pass" : ""}${state.draftAudit?.verdict === "fail" ? " is-fail" : ""}${busyKind === "audit-draft" ? " is-busy" : ""}`;
  document.querySelector("[data-station=polish]").classList.toggle("is-ready", Boolean(state.polish));
  document.querySelector("[data-station=audit-polish]").className =
    `station${state.polishAudit?.verdict === "pass" ? " is-pass" : ""}${state.polishAudit?.verdict === "fail" ? " is-fail" : ""}${busyKind === "audit-polish" ? " is-busy" : ""}`;
  document.querySelector("[data-station=draft]").classList.toggle("is-busy", busyKind === "draft");
  document.querySelector("[data-station=polish]").classList.toggle("is-busy", busyKind === "polish");

  const keys = state.keys || {};
  keysEl.textContent = `Keys: GPT ${keys.openai ? "yes" : "no"} · Grok ${keys.xai ? "yes" : "no"} · Sonnet ${keys.anthropic ? "yes" : "no"}`;
  renderBusy();
}

function openVerse(verse) {
  verseInput.value = verse;
  loadVerse().catch((error) => setStatus(error.message, true));
}

function paintQueue() {
  if (!queue) {
    queueEl.hidden = true;
    return;
  }
  queueEl.hidden = false;
  const total = (queue.verses || []).length;
  const passed = queue.passed || [];
  const holds = queue.holds || [];
  const errors = queue.errors || [];
  const current = queue.currentVerse ? ` · now ${queue.currentVerse}` : "";
  const passedBit = passed.length
    ? `${passed.length} passed (${verseRanges(passed)})`
    : "0 passed";
  const holdBit = holds.length
    ? `${holds.length} hold (${verseRanges(holds.map((item) => item.verse))})`
    : "0 holds";
  const errorBit = errors.length
    ? `${errors.length} error (${verseRanges(errors.map((item) => item.verse))})`
    : "0 errors";
  queueSummaryEl.textContent = `${passedBit} · ${holdBit} · ${errorBit} · ${total} verses${current}`;

  queueHoldsEl.innerHTML = "";
  queueHoldsLabelEl.hidden = holds.length === 0;
  for (const item of holds) {
    const li = document.createElement("li");
    li.className = "hold";
    const header = document.createElement("header");
    const button = document.createElement("button");
    button.type = "button";
    const firstIssue = (item.findings || [])[0]?.issue || item.stage || "fail";
    button.textContent = `${item.verse} · ${firstIssue}`;
    button.addEventListener("click", () => openVerse(item.verse));
    const stage = document.createElement("span");
    stage.className = "hold-stage";
    stage.textContent = STAGE[item.stage] || item.stage || "fail";
    const verdict = document.createElement("span");
    verdict.className = `verdict ${item.verdict || "fail"}`;
    verdict.textContent = item.verdict || "fail";
    header.append(button, stage, verdict);
    li.append(header);
    if (item.spanish) {
      const es = document.createElement("p");
      es.className = "hold-es";
      es.textContent = item.spanish;
      li.append(es);
    }
    const findings = document.createElement("ul");
    findings.className = "hold-findings";
    const rows = item.findings || [];
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.textContent = "No cited findings. Open the verse to inspect Grok.";
      findings.append(empty);
    } else {
      for (const finding of rows) {
        appendFinding(findings, finding);
      }
    }
    li.append(findings);
    if (item.notes) {
      const notes = document.createElement("p");
      notes.className = "hold-notes";
      notes.textContent = item.notes;
      li.append(notes);
    }
    queueHoldsEl.append(li);
  }

  queueErrorsEl.innerHTML = "";
  queueErrorsLabelEl.hidden = errors.length === 0;
  for (const item of errors) {
    const li = document.createElement("li");
    li.className = "hold is-error";
    const header = document.createElement("header");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `v. ${item.verse}`;
    button.addEventListener("click", () => openVerse(item.verse));
    const stage = document.createElement("span");
    stage.className = "hold-stage";
    stage.textContent = "Error";
    header.append(button, stage);
    li.append(header);
    const body = document.createElement("p");
    body.className = "hold-notes";
    body.textContent = item.message || shortError(item.error);
    li.append(body);
    queueErrorsEl.append(li);
  }
}

async function loadQueue() {
  queue = await api(`/api/chapter?book=${encodeURIComponent(coords().book)}&chapter=${coords().chapter}`);
  paintQueue();
  return queue;
}

async function loadVerse() {
  setStatus("Loading packet…");
  state = await api(`/api/verse?book=${encodeURIComponent(coords().book)}&chapter=${coords().chapter}&verse=${coords().verse}`);
  setStatus("");
  paint();
  await loadQueue();
}

function stopChapterPoll() {
  clearInterval(chapterPoll);
  chapterPoll = 0;
}

async function refreshChapter() {
  const data = await loadQueue();
  const running = Boolean(data.running || data.job?.running);
  if (running) {
    const verse = data.currentVerse || data.job?.verse;
    workHintEl.textContent = verse
      ? `Now ${coords().book} ${coords().chapter}:${verse}. Fails park in Holds.`
      : WORK.chapter.hint;
    workTitleEl.textContent = `Chapter pass-through · ${elapsedLabel(Date.now() - busyStarted)}`;
    if (verse && Number(verseInput.value) === Number(verse)) {
      try {
        state = await api(`/api/verse?book=${encodeURIComponent(coords().book)}&chapter=${coords().chapter}&verse=${verse}`);
        paint();
      } catch (_error) {
        /* keep last painted verse */
      }
    }
    return;
  }
  stopChapterPoll();
  clearBusy();
  if (data.job?.error) {
    setStatus(data.job.error, true);
  } else {
    const holds = data.holds || [];
    const errors = data.errors || [];
    setStatus(
      `${(data.passed || []).length} passed · ${holds.length} hold (${verseRanges(holds.map((item) => item.verse)) || "none"}) · ${errors.length} error (${verseRanges(errors.map((item) => item.verse)) || "none"})`
    );
  }
  await loadVerse();
}

async function runChapter() {
  setBusy("chapter");
  await api("/api/chapter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      book: coords().book,
      chapter: coords().chapter,
      resume: true,
      polish: "warn",
    }),
  });
  stopChapterPoll();
  chapterPoll = setInterval(() => {
    refreshChapter().catch((error) => setStatus(error.message, true));
  }, 2000);
  await refreshChapter();
}

async function run(kind) {
  setBusy(kind);
  try {
    const data = await api(`/api/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(coords()),
    });
    state = data.state;
    setStatus(data.verdict ? `${kind}: ${data.verdict}` : "done");
    paint();
    await loadQueue();
  } finally {
    clearBusy();
    if (state) paint();
  }
}

document.querySelectorAll("[data-run]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await run(button.dataset.run);
    } catch (error) {
      setStatus(error.message, true);
    }
  });
});

loadButton.addEventListener("click", () => loadVerse().catch((error) => {
  setStatus(error.message, true);
}));

runChapterButton.addEventListener("click", () => runChapter().catch((error) => {
  clearBusy();
  stopChapterPoll();
  setStatus(error.message, true);
}));

async function boot() {
  const data = await api("/api/books");
  for (const book of data.books) {
    const option = document.createElement("option");
    option.value = book.slug;
    option.textContent = `${book.label} (${book.testament.toUpperCase()})`;
    bookSelect.append(option);
  }
  bookSelect.value = "exodo";
  await loadVerse();
}

boot().catch((error) => {
  setStatus(error.message, true);
});
