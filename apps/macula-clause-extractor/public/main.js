const form = document.querySelector("#range"), summary = document.querySelector("#summary"), clauses = document.querySelector("#clauses"), raw = document.querySelector("#json"), template = document.querySelector("#clause");
function show(data) {
  summary.textContent = `${data.clauses.length} MACULA CL nodes · ${data.propositions.length} canonical propositions · ${data.structural_nodes.length} structural nodes`;
  clauses.replaceChildren(...data.clauses.map(clause => {
    const view = template.content.cloneNode(true);
    view.querySelector("article").style.setProperty("--depth", clause.depth);
    view.querySelector(".meta").textContent = `Verse ${clause.verse} · ${clause.macula_node_id} · depth ${clause.depth}`;
    view.querySelector("h2").textContent = clause.macula_rule || "MACULA clause";
    view.querySelector(".lbf").textContent = `LBF: ${clause.lbf.text || "No LBF verse found"}`;
    view.querySelector(".hebrew").textContent = clause.macula.hebrew_text;
    view.querySelector(".gloss").textContent = clause.macula.english_gloss;
    view.querySelector(".relation").textContent = `Parent: ${clause.parent_clause_id || "top-level"} · Alignment: ${clause.alignment.status}`;
    return view;
  }));
  raw.textContent = JSON.stringify(data, null, 2);
}
async function extract(event) {
  event?.preventDefault();
  const values = new FormData(form), book = values.get("book"), chapter = values.get("chapter"), from = values.get("from"), to = values.get("to");
  summary.textContent = "Extracting…";
  const response = await fetch(`/api/analysis?book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(chapter)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not extract the passage.");
  show(data);
}
form.addEventListener("submit", event => extract(event).catch(error => { summary.textContent = error.message; }));
fetch("/api/books").then(response => response.json()).then(books => { document.querySelector("#book").replaceChildren(...books.map(book => new Option(book.spanish_name, book.name, book.name === "Isaiah", book.name === "Isaiah"))); return extract(); }).catch(error => { summary.textContent = error.message; });
