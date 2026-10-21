const bookSelect = document.querySelector("#book");
const chapterSelect = document.querySelector("#chapter");
const title = document.querySelector("#title");
const status = document.querySelector("#status");
const versesNode = document.querySelector("#verses");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");

let books = [];
let current = null;
let chapter = 1;

async function api(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function setLocation() {
  const url = new URL(location.href);
  url.searchParams.set("book", bookSelect.value);
  url.searchParams.set("chapter", String(chapter));
  history.replaceState(null, "", url);
}

function chapters() {
  return [...new Set((current?.verses || []).map(item => item.chapter))].sort((a, b) => a - b);
}

function renderChapter() {
  const available = chapters();
  if (!available.includes(chapter)) chapter = available[0] || 1;
  chapterSelect.replaceChildren(...available.map(number => {
    const option = document.createElement("option");
    option.value = String(number); option.textContent = String(number); return option;
  }));
  chapterSelect.value = String(chapter);
  title.textContent = `${current.label} ${chapter}`;
  versesNode.replaceChildren();
  for (const verse of current.verses.filter(item => item.chapter === chapter)) {
    const article = document.createElement("article");
    article.className = "verse";
    const number = document.createElement("span");
    number.className = "number"; number.textContent = verse.verse;
    const text = document.createElement("p");
    text.className = "text"; text.textContent = verse.text;
    const edit = document.createElement("button");
    edit.className = "edit"; edit.type = "button"; edit.textContent = "Corregir";
    edit.addEventListener("click", () => openEditor(article, verse));
    article.append(number, text, edit);
    versesNode.append(article);
  }
  const index = available.indexOf(chapter);
  previous.disabled = index <= 0;
  next.disabled = index < 0 || index >= available.length - 1;
  setLocation();
}

function openEditor(article, verse) {
  if (article.querySelector(".editor")) return;
  const editor = document.createElement("div");
  editor.className = "editor";
  const textarea = document.createElement("textarea");
  textarea.value = verse.text;
  const actions = document.createElement("div");
  actions.className = "actions";
  const save = document.createElement("button"); save.type = "button"; save.textContent = "Guardar corrección";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancelar";
  cancel.addEventListener("click", () => editor.remove());
  save.addEventListener("click", async () => {
    save.disabled = true; status.textContent = "Guardando…";
    try {
      await api(`/api/reader/verse?book=${encodeURIComponent(current.book)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book: current.book, chapter: verse.chapter, verse: verse.verse, original: verse.text, text: textarea.value })
      });
      verse.text = textarea.value.trim();
      article.querySelector(".text").textContent = verse.text;
      editor.remove(); status.textContent = `${current.label} ${verse.chapter}:${verse.verse} guardado`;
    } catch (error) { status.textContent = error.message; save.disabled = false; }
  });
  actions.append(save, cancel); editor.append(textarea, actions); article.append(editor); textarea.focus();
}

async function loadBook(book) {
  status.textContent = "Cargando…";
  current = await api(`/api/reader/book?book=${encodeURIComponent(book)}`);
  bookSelect.value = current.book;
  renderChapter();
  status.textContent = "";
}

bookSelect.addEventListener("change", () => { chapter = 1; loadBook(bookSelect.value); });
chapterSelect.addEventListener("change", () => { chapter = Number(chapterSelect.value); renderChapter(); scrollTo({ top: 0, behavior: "smooth" }); });
previous.addEventListener("click", () => { const list = chapters(); chapter = list[list.indexOf(chapter) - 1]; renderChapter(); scrollTo({ top: 0, behavior: "smooth" }); });
next.addEventListener("click", () => { const list = chapters(); chapter = list[list.indexOf(chapter) + 1]; renderChapter(); scrollTo({ top: 0, behavior: "smooth" }); });

const params = new URLSearchParams(location.search);
chapter = Number(params.get("chapter")) || 1;
const result = await api("/api/reader/books");
books = result.books || [];
for (const book of books) {
  const option = document.createElement("option"); option.value = book.id; option.textContent = book.label; bookSelect.append(option);
}
const requested = params.get("book");
await loadBook(books.some(book => book.id === requested || book.slug === requested) ? requested : (books.find(book => book.slug === "exodo")?.id || books[0]?.id));
