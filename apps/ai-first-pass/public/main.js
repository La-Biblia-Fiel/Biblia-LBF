const modelSelect = document.querySelector("#model-select");
const modelStatus = document.querySelector("#model-status");
const refreshModelsButton = document.querySelector("#refresh-models");
const chunkSize = document.querySelector("#chunk-size");
const bookList = document.querySelector("#book-list");
const librarySummary = document.querySelector("#library-summary");
const selectMissingButton = document.querySelector("#select-missing");
const clearBooksButton = document.querySelector("#clear-books");
const acknowledgement = document.querySelector("#acknowledgement");
const startButton = document.querySelector("#start-job");
const stopButton = document.querySelector("#stop-job");
const runMessage = document.querySelector("#run-message");
const progressTitle = document.querySelector("#progress-title");
const progressCount = document.querySelector("#progress-count");
const progressBar = document.querySelector("#progress-bar");
const currentReference = document.querySelector("#current-reference");
const jobLog = document.querySelector("#job-log");
const sourcePreview = document.querySelector("#source-preview");

let books = [];
let modelsAvailable = false;
let pollTimer = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/gu, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
  })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || `Request failed (${response.status}).`), { code: body.code });
  return body;
}

function selectedBooks() {
  return [...bookList.querySelectorAll("input[type=checkbox]:checked")].map(input => input.value);
}

function updateStartButton() {
  startButton.disabled = !modelsAvailable || !modelSelect.value || !selectedBooks().length || !acknowledgement.checked;
}

function formatBytes(value) {
  if (!value) return "";
  return `${(value / 1_000_000_000).toFixed(1)} GB`;
}

async function loadModels() {
  refreshModelsButton.disabled = true;
  modelSelect.disabled = true;
  modelStatus.textContent = "Connecting to Ollama…";
  try {
    const result = await api("/api/models");
    const saved = localStorage.getItem("lbf-first-pass-model") || "";
    modelSelect.replaceChildren();
    for (const model of result.models) {
      const option = document.createElement("option");
      option.value = model.name;
      option.textContent = [model.name, model.parameterSize, model.quantization, formatBytes(model.size)].filter(Boolean).join(" · ");
      modelSelect.append(option);
    }
    if (saved && result.models.some(model => model.name === saved)) modelSelect.value = saved;
    modelsAvailable = result.models.length > 0;
    modelSelect.disabled = !modelsAvailable;
    modelStatus.textContent = modelsAvailable
      ? `${result.models.length} local model${result.models.length === 1 ? "" : "s"} found at ${result.baseUrl}.`
      : "Ollama is running, but no models are installed. Run “ollama pull <model>”, then refresh.";
  } catch (error) {
    modelsAvailable = false;
    modelSelect.replaceChildren(new Option("Ollama unavailable", ""));
    modelStatus.textContent = error.message;
  } finally {
    refreshModelsButton.disabled = false;
    updateStartButton();
  }
}

function renderBooks() {
  const sourceTotal = books.reduce((sum, book) => sum + book.sourceVerses, 0);
  const existingTotal = books.reduce((sum, book) => sum + book.existingVerses, 0);
  const missingTotal = books.reduce((sum, book) => sum + book.missingVerses, 0);
  const blockedTotal = books.reduce((sum, book) => sum + book.blockedVerses, 0);
  librarySummary.textContent = `${existingTotal.toLocaleString()} of ${sourceTotal.toLocaleString()} canonical verses already exist; ${missingTotal.toLocaleString()} remain for a first pass${blockedTotal ? `, including ${blockedTotal} source gap requiring a human decision` : ""}.`;
  bookList.innerHTML = books.map(book => {
    const complete = book.missingVerses === 0;
    const checked = book.eligible ? " checked" : "";
    const disabled = book.eligible ? "" : " disabled";
    return `<label class="book-row" data-protected="${book.protected}" data-complete="${complete}">
      <input type="checkbox" value="${escapeHtml(book.slug)}"${checked}${disabled} />
      <span>
        <span class="book-name">${escapeHtml(book.title)}</span>
        <span class="book-count">${book.existingVerses.toLocaleString()} / ${book.sourceVerses.toLocaleString()} verses · ${escapeHtml(book.textualBasis)}${book.blockedVerses ? ` · ${book.blockedVerses} source gap` : ""}</span>
      </span>
      <span class="badge">${complete ? "complete" : book.protected ? "protected" : book.blockedVerses === book.missingVerses ? "source gap" : `${book.translatableMissingVerses} missing`}</span>
    </label>`;
  }).join("");
  bookList.querySelectorAll("input").forEach(input => input.addEventListener("change", () => {
    updateStartButton();
    if (input.checked) void loadPreview(input.value);
  }));
  updateStartButton();
}

async function loadBooks() {
  const result = await api("/api/books");
  books = result.books;
  renderBooks();
  const first = books.find(book => book.eligible);
  if (first) await loadPreview(first.slug);
}

async function loadPreview(slug) {
  sourcePreview.innerHTML = `<p class="help">Loading source…</p>`;
  try {
    const result = await api(`/api/book?book=${encodeURIComponent(slug)}`);
    if (!result.preview.length) {
      sourcePreview.innerHTML = `<p class="help">${escapeHtml(result.book.title)} has no missing source verses.</p>`;
      return;
    }
    sourcePreview.innerHTML = result.preview.map(item => `<article class="source-verse">
      <h3>${escapeHtml(item.reference)}</h3>
      <p class="source-text" dir="auto">${escapeHtml(item.sourceText || item.sourceNote)}</p>
      <details><summary>Morphology evidence</summary><pre class="morphology">${escapeHtml(item.morphology || "No morphology helper available.")}</pre></details>
    </article>`).join("");
  } catch (error) {
    sourcePreview.innerHTML = `<p class="help">${escapeHtml(error.message)}</p>`;
  }
}

function renderJob(job) {
  const active = ["running", "stopping"].includes(job.state);
  progressTitle.textContent = ({
    idle: "Idle", running: "Translating", stopping: "Stopping safely", stopped: "Stopped", complete: "First pass complete", error: "Needs attention"
  })[job.state] || job.state;
  progressCount.textContent = `${job.completedVerses.toLocaleString()} / ${job.totalVerses.toLocaleString()} verses`;
  progressBar.max = Math.max(1, job.totalVerses);
  progressBar.value = job.completedVerses;
  currentReference.textContent = job.currentReference || (job.error?.message ?? "Choose a model and books to begin.");
  jobLog.innerHTML = [...job.logs].reverse().map(entry => `<li data-level="${escapeHtml(entry.level)}"><time>${new Date(entry.at).toLocaleTimeString()}</time> · ${escapeHtml(entry.message)}</li>`).join("");
  stopButton.disabled = !active || job.state === "stopping";
  startButton.disabled = active || !modelsAvailable || !modelSelect.value || !selectedBooks().length || !acknowledgement.checked;
  modelSelect.disabled = active || !modelsAvailable;
  chunkSize.disabled = active;
  bookList.querySelectorAll("input").forEach(input => { input.disabled = active || !books.find(book => book.slug === input.value)?.eligible; });
  runMessage.textContent = job.error?.message || (job.state === "stopped" ? "Saved safely. Start again to resume from missing verses." : "");

  clearTimeout(pollTimer);
  if (active) {
    pollTimer = setTimeout(pollJob, 1200);
  } else if (["complete", "stopped"].includes(job.state)) {
    void loadBooks();
  }
}

async function pollJob() {
  try {
    renderJob(await api("/api/job"));
  } catch (error) {
    runMessage.textContent = error.message;
    pollTimer = setTimeout(pollJob, 2500);
  }
}

refreshModelsButton.addEventListener("click", loadModels);
modelSelect.addEventListener("change", () => {
  localStorage.setItem("lbf-first-pass-model", modelSelect.value);
  updateStartButton();
});
acknowledgement.addEventListener("change", updateStartButton);
selectMissingButton.addEventListener("click", () => {
  bookList.querySelectorAll("input:not(:disabled)").forEach(input => { input.checked = true; });
  updateStartButton();
});
clearBooksButton.addEventListener("click", () => {
  bookList.querySelectorAll("input:not(:disabled)").forEach(input => { input.checked = false; });
  updateStartButton();
});
startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  runMessage.textContent = "Starting…";
  try {
    const job = await api("/api/job/start", {
      method: "POST",
      body: JSON.stringify({
        model: modelSelect.value,
        books: selectedBooks(),
        chunkSize: Number(chunkSize.value),
        acknowledged: acknowledgement.checked
      })
    });
    renderJob(job);
  } catch (error) {
    runMessage.textContent = error.message;
    updateStartButton();
  }
});
stopButton.addEventListener("click", async () => {
  stopButton.disabled = true;
  runMessage.textContent = "The current Ollama request will finish, then the app will stop.";
  try { renderJob(await api("/api/job/stop", { method: "POST", body: "{}" })); }
  catch (error) { runMessage.textContent = error.message; }
});

await Promise.all([loadModels(), loadBooks()]);
renderJob(await api("/api/job"));
