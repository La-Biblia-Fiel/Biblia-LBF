import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { leaves, pruneToRange, sourceOrder } from "./sblgnt.js";

function normalGreek(value) {
  return String(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{Script=Greek}]/gu, "");
}

function lcs(left, right, leftValue, rightValue) {
  const rows = left.length;
  const columns = right.length;
  const grid = Array.from({ length: rows + 1 }, () => Array(columns + 1).fill(0));
  for (let row = rows - 1; row >= 0; row -= 1) for (let column = columns - 1; column >= 0; column -= 1) {
    grid[row][column] = leftValue(left[row]) === rightValue(right[column])
      ? grid[row + 1][column + 1] + 1
      : Math.max(grid[row + 1][column], grid[row][column + 1]);
  }
  const pairs = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (leftValue(left[row]) === rightValue(right[column])) { pairs.push([row, column]); row += 1; column += 1; }
    else if (grid[row + 1][column] >= grid[row][column + 1]) row += 1;
    else column += 1;
  }
  return pairs;
}

function trPosition(token) {
  return `${token.source_ref}:${token.source_ordinal}`;
}

function sentenceReferences(tokens) {
  return [...new Set(tokens.map(token => token.source_ref))];
}

function clauseType(node) {
  const type = node.attrs.ClType?.toLowerCase();
  return type || "reference-projected";
}

export async function projectSblgntToTr({ repoRoot, rows, sblSentences, chapter, firstVerse, lastVerse }) {
  const trTokens = rows.flatMap(row => row.tokens.map(token => ({ ...token, source_locator: `tr1894.txt:${token.source_ref}:${token.source_ordinal}` })));
  const selected = sblSentences.map(sentence => ({ ...sentence, root: pruneToRange(sentence.root, chapter, firstVerse, lastVerse) })).filter(sentence => sentence.root);
  const sblTerms = sourceOrder(selected.flatMap(sentence => leaves(sentence.root)));
  const pairs = lcs(sblTerms, trTokens, term => normalGreek(term.text), token => normalGreek(token.surface_source));
  const sblMap = new Map(pairs.map(([left, right]) => [sblTerms[left].attrs["xml:id"], trTokens[right]]));
  const mappedTr = new Set(pairs.map(([, right]) => trTokens[right].token_id));
  const unmatchedSbl = sblTerms.filter(term => !sblMap.has(term.attrs["xml:id"])).map(term => ({ reference: term.attrs.ref, text: term.text, node_id: term.attrs["xml:id"] }));
  const unmatchedTr = trTokens.filter(token => !mappedTr.has(token.token_id));
  const nodes = [];
  const sentences = [];
  const reference_links = [];
  const assigned = new Set();
  let sentenceCounter = 0;
  let clauseSequence = 0;

  for (const sourceSentence of selected) {
    const mapped = leaves(sourceSentence.root).filter(term => sblMap.has(term.attrs["xml:id"]));
    if (!mapped.length) continue;
    sentenceCounter += 1;
    const sentenceId = `MAT.${chapter}.s${String(sentenceCounter).padStart(3, "0")}`;
    const root = { node_id: sentenceId, kind: "sentence", category: "s", children: [], evidence: ["TR1894 review draft projected from MACULA Greek SBLGNT; review required."] };
    nodes.push(root);
    let ordinary = 0;
    let clauses = 0;
    const convert = sourceNode => {
      if (!sourceNode.children.length) {
        const token = sblMap.get(sourceNode.attrs["xml:id"]);
        if (!token || assigned.has(token.token_id)) return null;
        assigned.add(token.token_id);
        ordinary += 1;
        const node = { node_id: `${sentenceId}.n${String(ordinary).padStart(3, "0")}`, kind: "word", category: (sourceNode.attrs.Cat || "word").toLowerCase(), token_id: token.token_id, evidence: [`MACULA Greek SBLGNT ${sourceNode.attrs["xml:id"]} mapped by normalized source-form LCS.`] };
        nodes.push(node);
        return { node, first: trTokens.indexOf(token) };
      }
      const children = sourceNode.children.map(convert).filter(Boolean).sort((a, b) => a.first - b.first);
      if (!children.length) return null;
      const isClause = sourceNode.attrs.Cat === "CL";
      const nodeId = isClause ? `${sentenceId}.c${String(++clauses).padStart(3, "0")}` : `${sentenceId}.n${String(++ordinary).padStart(3, "0")}`;
      const category = (sourceNode.attrs.Cat || "phrase").toLowerCase();
      const node = { node_id: nodeId, kind: isClause ? "clause" : "phrase", category, children: children.map(child => child.node.node_id), rule: sourceNode.attrs.Rule || undefined, evidence: [`MACULA Greek SBLGNT ${sourceNode.attrs.nodeId || sourceNode.attrs.Id || "node"} projected as comparison-only; human review required.`] };
      if (isClause) node.clause_type = clauseType(sourceNode);
      if (["S", "V", "O", "IO", "P", "ADV", "VC", "OC"].includes(sourceNode.attrs.Cat)) node.function = sourceNode.attrs.Cat.toLowerCase();
      for (const [key, value] of Object.entries(node)) if (value === undefined) delete node[key];
      nodes.push(node);
      if (isClause) reference_links.push({ reference_dataset: "MACULA Greek SBLGNT", reference_revision: "local download", reference_id: sourceNode.attrs.nodeId || sourceNode.attrs.Id || nodeId, relation: "comparison-only", basis: "Automated normalized-form projection onto local TR1894 terminals; requires human review." });
      return { node, first: children[0].first };
    };
    const converted = convert(sourceSentence.root);
    if (!converted) continue;
    root.children.push(converted.node.node_id);
    sentences.push({ sentence_id: sentenceId, root_node_id: sentenceId, source_refs: sentenceReferences(mapped.map(term => sblMap.get(term.attrs["xml:id"]))) });
  }

  // Preserve every TR terminal. These explicit placeholders identify textual
  // differences rather than pretending that SBLGNT supplied a syntax decision.
  for (const token of trTokens.filter(item => !assigned.has(item.token_id))) {
    sentenceCounter += 1;
    const sentenceId = `MAT.${chapter}.s${String(sentenceCounter).padStart(3, "0")}`;
    const wordId = `${sentenceId}.n001`;
    const clauseId = `${sentenceId}.c001`;
    nodes.push({ node_id: sentenceId, kind: "sentence", category: "s", children: [clauseId], evidence: ["TR-only terminal held for human reconciliation."] });
    nodes.push({ node_id: wordId, kind: "word", category: "unresolved", token_id: token.token_id, evidence: ["No unambiguous SBLGNT counterpart after normalized source-form alignment."] });
    nodes.push({ node_id: clauseId, kind: "clause", category: "cl", clause_type: "unresolved-reference-difference", children: [wordId], evidence: ["Placeholder for a TR1894 textual difference; not a syntax decision."] });
    sentences.push({ sentence_id: sentenceId, root_node_id: sentenceId, source_refs: [token.source_ref] });
  }

  const nodeById = new Map(nodes.map(node => [node.node_id, node]));
  const descendants = id => {
    const node = nodeById.get(id);
    return node.kind === "word" ? [node.token_id] : node.children.flatMap(descendants);
  };
  const clauses = [];
  const visit = (id, sentenceId, parentClauseId = null, depth = 0) => {
    const node = nodeById.get(id);
    const nextParent = node.kind === "clause" ? node.node_id : parentClauseId;
    const nextDepth = node.kind === "clause" ? depth + 1 : depth;
    if (node.kind === "clause") {
      const token_ids = descendants(id);
      clauses.push({ clause_id: id, sentence_id: sentenceId, parent_clause_id: parentClauseId, sequence: clauseSequence++, token_ids, depth, category: node.category, clause_type: node.clause_type, function: node.function, text: token_ids.map(tokenId => { const token = trTokens.find(item => item.token_id === tokenId); return token.surface_source + token.after; }).join("").trimEnd() });
    }
    if (node.kind !== "word") node.children.forEach(child => visit(child, sentenceId, nextParent, nextDepth));
  };
  sentences.forEach(sentence => visit(sentence.root_node_id, sentence.sentence_id));
  const trBytes = await readFile(join(repoRoot, "source", "greek", "TR1894", "tr1894.txt"));
  return {
    summary: { sbl_terminals: sblTerms.length, tr_terminals: trTokens.length, mapped_terminals: pairs.length, sbl_only: unmatchedSbl, tr_only: unmatchedTr.map(token => ({ token_id: token.token_id, surface: token.surface_source })) },
    fixture: { schema_version: "0.1.0", provenance: { text_authority: "TR1894", text_source: "source/greek/TR1894/tr1894.txt", text_revision: "local Biblia-LBF source", text_sha256: createHash("sha256").update(trBytes).digest("hex"), tokenization_policy: "source-token surface plus after; SBLGNT projection is comparison-only" }, tokens: trTokens, sentences, nodes, clauses, reference_links }
  };
}
