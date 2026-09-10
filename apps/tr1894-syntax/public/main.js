const $ = selector => document.querySelector(selector);
const state = { rows: [] };

function range() {
  return { chapter: $("#chapter").value, from: $("#first-verse").value, to: $("#last-verse").value };
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function showSource(rows) {
  state.rows = rows;
  $("#source").classList.remove("empty");
  $("#source").innerHTML = rows.map(row => `
    <article class="verse">
      <div class="reference">${row.reference}</div>
      <div class="greek" lang="el">${row.text}</div>
      <div class="tokens">${row.tokens.map(token => `${token.token_id} = ${token.surface_source}`).join(" · ")}</div>
      <div class="morphology">UTR helper positions: ${row.utr.map(token => `${token.ordinal}:${token.surface_beta}{${token.raw_tag}}`).join(" ") || "(none)"}</div>
    </article>`).join("");
}

async function loadPassage() {
  $("#passage-status").textContent = "Loading the local TR1894 source…";
  try {
    const query = new URLSearchParams(range());
    const data = await request(`/api/passage?${query}`);
    showSource(data.rows);
    $("#passage-status").textContent = `Loaded Matthew ${data.chapter}:${data.firstVerse}–${data.lastVerse} from the local TR1894 spine.`;
  } catch (error) {
    $("#passage-status").textContent = error.message;
  }
}

async function refreshModels() {
  $("#model-status").textContent = "Checking Ollama…";
  try {
    const data = await request("/api/models");
    const model = $("#model");
    const choices = [...new Set([data.defaultModel, ...data.models])];
    model.replaceChildren(...choices.map(name => new Option(name === data.defaultModel ? `${name} (default)` : name, name)));
    model.value = data.defaultModel;
    $("#model-status").textContent = data.models.includes(data.defaultModel)
      ? `Ollama is ready at ${data.baseUrl}; the default model is installed.`
      : `Ollama is ready at ${data.baseUrl}. Install ${data.defaultModel} or choose an installed model.`;
  } catch (error) {
    $("#model-status").textContent = error.message;
  }
}

async function suggest() {
  $("#suggestion").textContent = "Requesting a structured suggestion from Ollama…";
  try {
    const data = await request("/api/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...range(), model: $("#model").value }) });
    $("#suggestion").textContent = JSON.stringify(data.suggestion, null, 2);
  } catch (error) {
    $("#suggestion").textContent = error.message;
  }
}

async function reference() {
  try {
    const data = await request("/api/reference");
    $("#reference-status").textContent = `${data.dataset} is available at ${data.root}.`;
  } catch (error) {
    $("#reference-status").textContent = error.message;
  }
}

async function project() {
  $("#projection").textContent = "Mapping SBLGNT terminals and projecting its clause tree onto TR1894…";
  try {
    const data = await request("/api/project", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(range()) });
    const summary = data.summary;
    $("#projection").textContent = JSON.stringify({
      sbl_terminals: summary.sbl_terminals,
      tr_terminals: summary.tr_terminals,
      mapped_terminals: summary.mapped_terminals,
      sbl_only: summary.sbl_only,
      tr_only: summary.tr_only,
      instruction: "The generated JSON is a reference-projected TR review draft. Resolve every listed difference before treating any clause as reviewed."
    }, null, 2);
    $("#fixture-json").value = JSON.stringify(data.fixture, null, 2);
    $("#validation").textContent = "Reference-projected draft loaded. Its tree can be checked now; textual differences remain explicit placeholders for review.";
  } catch (error) {
    $("#projection").textContent = error.message;
  }
}

async function fixtures() {
  const data = await request("/api/fixtures");
  const select = $("#fixture");
  select.replaceChildren(...data.fixtures.map(name => new Option(name, name)));
  if (data.fixtures.includes("matthew-1-18-25.syntax.json")) select.value = "matthew-1-18-25.syntax.json";
}

async function loadFixture() {
  $("#validation").textContent = "Loading fixture…";
  try {
    const name = $("#fixture").value;
    const data = await request(`/api/fixture?name=${encodeURIComponent(name)}`);
    $("#fixture-json").value = JSON.stringify(data.fixture, null, 2);
    $("#validation").textContent = "Fixture loaded. Review every model or human decision before running checks.";
  } catch (error) {
    $("#validation").textContent = error.message;
  }
}

async function validate() {
  $("#validation").textContent = "Running source, coverage, tree, clause-index, and morphology checks…";
  try {
    const fixture = JSON.parse($("#fixture-json").value);
    const data = await request("/api/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixture }) });
    $("#validation").textContent = `${data.ok ? "PASS" : "NOT VALID"}\n${data.output}`;
  } catch (error) {
    $("#validation").textContent = error.message;
  }
}

$("#load-passage").addEventListener("click", loadPassage);
$("#refresh-models").addEventListener("click", refreshModels);
$("#suggest").addEventListener("click", suggest);
$("#project").addEventListener("click", project);
$("#load-fixture").addEventListener("click", loadFixture);
$("#validate").addEventListener("click", validate);

await Promise.all([loadPassage(), reference(), refreshModels(), fixtures()]);
