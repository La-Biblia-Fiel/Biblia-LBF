import { readFile } from "node:fs/promises";

export async function readStatusRows(statusPath) {
  const text = await readFile(statusPath, "utf8");
  const rows = new Map();
  for (const line of text.split("\n")) {
    if (!line.startsWith("| ")) continue;
    const cells = line.slice(1, -1).split("|").map(cell => cell.trim());
    if (cells.length < 9 || ["book", "---"].includes(cells[0]) || cells[0].startsWith("-")) continue;
    rows.set(cells[0], {
      book: cells[0],
      testament: cells[1],
      translation: cells[2],
      alignment: cells[3]
    });
  }
  return rows;
}
