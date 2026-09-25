import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPassage } from "./src/extractor.js";
import { BOOKS } from "./src/books.js";
import { buildPropositions } from "./src/propositions.js";
import { buildJevState, createReferentResolver } from "./src/jev-state.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
function send(response, status, body, type = "text/plain; charset=utf-8") { response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); response.end(body); }
createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  try {
    if (url.pathname === "/api/books") return send(response, 200, JSON.stringify(BOOKS), "application/json; charset=utf-8");
    if (url.pathname === "/api/passage") {
      const chapter = Number(url.searchParams.get("chapter") || 53), from = Number(url.searchParams.get("from") || 4), to = Number(url.searchParams.get("to") || 6);
      return send(response, 200, JSON.stringify(await loadPassage(repoRoot, { book: url.searchParams.get("book") || "Isaiah", chapter, firstVerse: from, lastVerse: to })), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/propositions") {
      const chapter = Number(url.searchParams.get("chapter") || 53), from = Number(url.searchParams.get("from") || 4), to = Number(url.searchParams.get("to") || 6);
      const raw = await loadPassage(repoRoot, { book: url.searchParams.get("book") || "Isaiah", chapter, firstVerse: from, lastVerse: to });
      return send(response, 200, JSON.stringify(buildPropositions(raw)), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/analysis") {
      const chapter = Number(url.searchParams.get("chapter") || 53), from = Number(url.searchParams.get("from") || 4), to = Number(url.searchParams.get("to") || 6);
      const raw = await loadPassage(repoRoot, { book: url.searchParams.get("book") || "Isaiah", chapter, firstVerse: from, lastVerse: to });
      return send(response, 200, JSON.stringify(buildPropositions(raw)), "application/json; charset=utf-8");
    }
    if (url.pathname === "/api/jev-state") {
      const chapter = Number(url.searchParams.get("chapter") || 53), from = Number(url.searchParams.get("from") || 4), to = Number(url.searchParams.get("to") || 6);
      const analysis = buildPropositions(await loadPassage(repoRoot, { book: url.searchParams.get("book") || "Isaiah", chapter, firstVerse: from, lastVerse: to }));
      return send(response, 200, JSON.stringify(await buildJevState(analysis, { resolveReferent: createReferentResolver(repoRoot) })), "application/json; charset=utf-8");
    }
    const pathname = url.pathname === "/" ? "/public/index.html" : `/public${url.pathname}`;
    const path = fileURLToPath(new URL(`.${pathname}`, import.meta.url));
    if (!path.startsWith(appRoot) || !(await stat(path)).isFile()) return send(response, 404, "Not found");
    return send(response, 200, await readFile(path), types[extname(path)] || "application/octet-stream");
  } catch (error) { return send(response, 500, JSON.stringify({ error: error.message }), "application/json; charset=utf-8"); }
}).listen(Number(process.env.PORT || 1435), "127.0.0.1", () => console.log("MACULA Clause Extractor: http://127.0.0.1:1435/"));
