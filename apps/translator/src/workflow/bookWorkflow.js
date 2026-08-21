const STATUS_COLUMNS = [
  "book",
  "testament",
  "translation",
  "alignment",
  "translation_by",
  "translation_on",
  "alignment_by",
  "alignment_on",
  "notes"
];

export function parseStatusRows(text = "") {
  const rows = [];
  for (const line of String(text).split("\n")) {
    if (!line.startsWith("| ")) continue;
    const cells = line.slice(1, -1).split("|").map(cell => cell.trim());
    if (cells.length < STATUS_COLUMNS.length || cells[0] === "book" || cells[0].startsWith("-")) continue;
    rows.push(Object.fromEntries(STATUS_COLUMNS.map((column, index) => [column, cells[index] || ""])));
  }
  return rows;
}

export function statusRow(text, book) {
  return parseStatusRows(text).find(row => row.book === book) || null;
}

export function formatStatusRow(row) {
  return `| ${STATUS_COLUMNS.map(column => row[column] || "").join(" | ")} |`;
}

export function replaceStatusRow(text, book, transform) {
  const original = statusRow(text, book);
  if (!original) throw new Error(`${book} is not in STATUS.md`);
  const updated = transform({ ...original });
  const lines = String(text).split("\n");
  const next = lines.map(line => {
    if (!line.startsWith("| ")) return line;
    const first = line.slice(1).split("|", 1)[0].trim();
    return first === book ? formatStatusRow(updated) : line;
  });
  return { text: next.join("\n"), row: updated };
}

export function approveStage(text, { book, stage, approvedBy, approvedOn }) {
  if (!new Set(["translation", "alignment"]).has(stage)) {
    throw new Error("Approval stage must be translation or alignment.");
  }
  const name = String(approvedBy || "").trim();
  if (!name) throw new Error("The human approver's name is required.");
  if (name.length > 120) throw new Error("The human approver's name is too long.");
  if (/[\r\n|]/u.test(name)) throw new Error("The human approver's name contains invalid characters.");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(approvedOn || ""))) {
    throw new Error("Approval date must be an ISO date.");
  }

  return replaceStatusRow(text, book, row => {
    if (row[stage] !== "ready") {
      throw new Error(`${stage} must be ready before human approval; current state is ${row[stage]}.`);
    }
    if (stage === "alignment" && row.translation !== "done") {
      throw new Error("Translation must be human-approved before alignment approval.");
    }
    row[stage] = "done";
    row[`${stage}_by`] = name;
    row[`${stage}_on`] = approvedOn;
    return row;
  });
}

export function invalidateAfterEdit(text, { book, stage }) {
  if (!new Set(["translation", "alignment"]).has(stage)) {
    throw new Error("Edit stage must be translation or alignment.");
  }
  return replaceStatusRow(text, book, row => {
    const clear = (target, createDraft = true) => {
      if (createDraft || row[target] !== "none") row[target] = "draft";
      row[`${target}_by`] = "";
      row[`${target}_on`] = "";
    };
    clear(stage);
    // Alignment is bound to the exact Spanish text. A translation edit invalidates both.
    if (stage === "translation") clear("alignment", false);
    return row;
  });
}

export function workflowForRow(row) {
  const translationDone = row.translation === "done";
  const alignmentDone = row.alignment === "done";
  return {
    finished: translationDone && alignmentDone,
    nextAction: !translationDone
      ? (row.translation === "ready" ? "approve-translation" : "verify-translation")
      : !alignmentDone
        ? (row.alignment === "ready" ? "approve-alignment" : "verify-alignment")
        : "export",
    stages: {
      translation: row.translation,
      alignment: row.alignment
    }
  };
}
