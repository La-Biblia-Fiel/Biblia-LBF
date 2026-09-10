import { readFile } from "node:fs/promises";
import { join } from "node:path";

function attributes(text) {
  return Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/gu)].map(match => [match[1], match[2]]));
}

function referenceParts(reference = "") {
  const match = reference.match(/^MAT\s+(\d+):(\d+)!(\d+)$/u);
  return match ? { chapter: Number(match[1]), verse: Number(match[2]), ordinal: Number(match[3]) } : null;
}

function finalize(node) {
  node.text = node.text.trim();
  node.children.forEach(finalize);
  return node;
}

/** Parse the small, regular Node subset needed for a read-only MACULA comparison. */
export function parseSblgntNodes(xml) {
  const sentences = [];
  const stack = [];
  let sentence;
  for (const match of String(xml).matchAll(/<(\/)?(Sentence|Node)\b([^>]*)>|([^<]+)/gu)) {
    if (match[4]) {
      if (stack.length) stack.at(-1).text += match[4];
      continue;
    }
    const closing = Boolean(match[1]);
    const tag = match[2];
    if (!closing && tag === "Sentence") {
      sentence = { ref: attributes(match[3]).ref || "", root: null };
    } else if (!closing && tag === "Node") {
      const node = { attrs: attributes(match[3]), children: [], text: "" };
      if (stack.length) stack.at(-1).children.push(node);
      else if (sentence) sentence.root = node;
      stack.push(node);
    } else if (closing && tag === "Node") {
      stack.pop();
    } else if (closing && tag === "Sentence") {
      if (sentence?.root) sentences.push({ ...sentence, root: finalize(sentence.root) });
      sentence = undefined;
    }
  }
  return sentences;
}

export function leaves(node) {
  return node.children.length ? node.children.flatMap(leaves) : [node];
}

export function pruneToRange(node, chapter, firstVerse, lastVerse) {
  if (!node.children.length) {
    const ref = referenceParts(node.attrs.ref);
    return ref && ref.chapter === chapter && ref.verse >= firstVerse && ref.verse <= lastVerse ? node : null;
  }
  const children = node.children.map(child => pruneToRange(child, chapter, firstVerse, lastVerse)).filter(Boolean);
  return children.length ? { ...node, children } : null;
}

export function sourceOrder(leavesToOrder) {
  return [...leavesToOrder].sort((left, right) => {
    const a = referenceParts(left.attrs.ref);
    const b = referenceParts(right.attrs.ref);
    return a.chapter - b.chapter || a.verse - b.verse || a.ordinal - b.ordinal;
  });
}

export async function loadSblgntMatthew(root) {
  const xml = await readFile(join(root, "SBLGNT", "nodes", "01-matthew.xml"), "utf8");
  return parseSblgntNodes(xml);
}

export function defaultSblgntRoot() {
  return process.env.LBF_MACULA_GREEK_ROOT || "/Users/johnwry/Downloads/macula-greek-main";
}
