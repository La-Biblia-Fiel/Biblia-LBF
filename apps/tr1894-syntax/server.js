import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { DEFAULT_MODEL, baseUrl, listModels, suggestClauses } from "./src/ollama.js";
import { loadMatthewPassage, sourcePrompt } from "./src/tr1894-source.js";
import { defaultSblgntRoot, loadSblgntMatthew } from "./src/sblgnt.js";
import { projectSblgntToTr } from "./src/projector.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(appRoot, "..", "..");
const publicRoot = join(appRoot, "public");
const prototypesRoot = join(repoRoot, "prototypes");
const port = Number(process.env.PORT || 1431);
const contentTypes = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(body);
}

function json(response, status, value) {
  send(response, status, JSON.stringify(value), "application/json; charset=utf-8");
}

async function body(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 2_000_000) throw Object.assign(new Error("Request is too large."), { code: "TOO_LARGE" });
  }
  try {
    return value.trim() ? JSON.parse(value) : {};
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { code: "INVALID_JSON" });
  }
}

function passageArguments(params) {
  const chapter = Number(params.get("chapter") || 1);
  const firstVerse = Number(params.get("from") || 18);
  const lastVerse = Number(params.get("to") || 25);
  if (![chapter, firstVerse, lastVerse].every(Number.isInteger) || chapter < 1 || firstVerse < 1 || lastVerse < firstVerse || lastVerse - firstVerse > 30) {
    throw Object.assign(new Error("Choose a valid Matthew chapter and a range of at most 31 verses."), { code: "INVALID_RANGE" });
  }
  return { chapter, firstVerse, lastVerse };
}

function runValidator(path) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [join(repoRoot, "tools", "validate_syntax_prototype.py"), path], { cwd: repoRoot });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.once("error", reject);
    child.once("close", code => resolve({ ok: code === 0, output: output.trim() }));
  });
}

async function validateFixture(fixture) {
  const directory = await mkdtemp(join(tmpdir(), "lbf-tr1894-syntax-"));
  const path = join(directory, "fixture.json");
  try {
    await writeFile(path, JSON.stringify(fixture), "utf8");
    return await runValidator(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function listFixtures() {
  const entries = await readdir(prototypesRoot, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.endsWith(".syntax.json")).map(entry => entry.name).sort();
}

async function readFixture(name) {
  if (!/^[a-z0-9][a-z0-9-]*\.syntax\.json$/u.test(name || "")) throw Object.assign(new Error("Unknown fixture."), { code: "NOT_FOUND" });
  return JSON.parse(await readFile(join(prototypesRoot, name), "utf8"));
}

async function api(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/models") {
    try {
      json(response, 200, { available: true, baseUrl: baseUrl(), defaultModel: DEFAULT_MODEL, models: await listModels() });
    } catch (error) {
      json(response, 503, { available: false, baseUrl: baseUrl(), defaultModel: DEFAULT_MODEL, models: [], error: error.message });
    }
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/passage") {
    const args = passageArguments(url.searchParams);
    json(response, 200, { ...args, rows: await loadMatthewPassage(repoRoot, args.chapter, args.firstVerse, args.lastVerse) });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/reference") {
    const root = defaultSblgntRoot();
    try {
      await stat(join(root, "SBLGNT", "nodes", "01-matthew.xml"));
      json(response, 200, { available: true, root, dataset: "MACULA Greek SBLGNT nodes" });
    } catch {
      json(response, 503, { available: false, root, error: "MACULA Greek SBLGNT nodes were not found at this path. Set LBF_MACULA_GREEK_ROOT to the macula-greek-main folder." });
    }
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/fixtures") {
    json(response, 200, { fixtures: await listFixtures() });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/fixture") {
    json(response, 200, { fixture: await readFixture(url.searchParams.get("name")) });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/suggest") {
    const input = await body(request);
    const args = passageArguments(new URLSearchParams({ chapter: input.chapter, from: input.from, to: input.to }));
    const rows = await loadMatthewPassage(repoRoot, args.chapter, args.firstVerse, args.lastVerse);
    json(response, 200, { suggestion: await suggestClauses({ model: input.model || DEFAULT_MODEL, source: sourcePrompt(rows) }) });
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/project") {
    const input = await body(request);
    const args = passageArguments(new URLSearchParams({ chapter: input.chapter, from: input.from, to: input.to }));
    const rows = await loadMatthewPassage(repoRoot, args.chapter, args.firstVerse, args.lastVerse);
    const result = await projectSblgntToTr({ repoRoot, rows, sblSentences: await loadSblgntMatthew(defaultSblgntRoot()), ...args });
    json(response, 200, result);
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/validate") {
    const input = await body(request);
    if (!input.fixture || typeof input.fixture !== "object" || Array.isArray(input.fixture)) throw Object.assign(new Error("Paste a JSON fixture object first."), { code: "INVALID_JSON" });
    json(response, 200, await validateFixture(input.fixture));
    return;
  }
  json(response, 404, { error: "Not found." });
}

async function staticFile(response, url) {
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safe = normalize(requested).replace(/^(\.\.(?:\/|\\|$))+/u, "");
  const path = join(publicRoot, safe);
  if (!path.startsWith(publicRoot)) return send(response, 403, "Forbidden");
  try {
    if (!(await stat(path)).isFile()) return send(response, 404, "Not found");
    send(response, 200, await readFile(path), contentTypes[extname(path)] || "application/octet-stream");
  } catch {
    send(response, 404, "Not found");
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  try {
    if (url.pathname.startsWith("/api/")) await api(request, response, url);
    else await staticFile(response, url);
  } catch (error) {
    const status = ["INVALID_JSON", "INVALID_RANGE"].includes(error.code) ? 400 : error.code === "TOO_LARGE" ? 413 : error.code === "NOT_FOUND" ? 404 : 500;
    json(response, status, { error: error.message || "Unexpected error." });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`TR1894 Syntax Review: http://127.0.0.1:${port}/`);
});
