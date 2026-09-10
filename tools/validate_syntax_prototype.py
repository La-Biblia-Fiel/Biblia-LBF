#!/usr/bin/env python3
"""Validate a manually authored TR1894 syntax prototype.

This is deliberately a small-fixture validator. It does not generate syntax,
import a corpus, or change any canonical LBF data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TR_TEXT = ROOT / "source/greek/TR1894/tr1894.txt"


def fail(message: str) -> None:
    raise ValueError(message)


def source_verses() -> dict[str, str]:
    verses: dict[str, str] = {}
    for line in TR_TEXT.read_text(encoding="utf-8").splitlines()[1:]:
        fields = line.split("@", 3)
        if len(fields) != 4:
            fail(f"invalid TR source row: {line!r}")
        verses[fields[2]] = fields[3]
    return verses


def utr_tokens() -> dict[str, list[dict[str, str]]]:
    records: dict[tuple[int, int], str] = {}
    current: tuple[int, int] | None = None
    path = ROOT / "source/greek/TR1894/robinson-parsed/MT.UTR"
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^(\d+):(\d+)\s+(.*)$", line)
        if match:
            current = (int(match.group(1)), int(match.group(2)))
            records[current] = match.group(3)
        elif current and line.startswith(" "):
            records[current] += " " + line.strip()

    output: dict[str, list[dict[str, str]]] = {}
    for (chapter, verse), text in records.items():
        reference = f"MAT.{chapter}.{verse}"
        output[reference] = [
            {"surface_beta": surface, "raw_tag": tag}
            for surface, tag in re.findall(r"([^\s{}|]+)(?:\s+\d+)+(?:\s+\{([^}]+)\})", text)
        ]
    return output


def descendants(node_id: str, nodes: dict[str, dict[str, Any]]) -> list[str]:
    node = nodes[node_id]
    if node["kind"] == "word":
        return [node["token_id"]]
    result: list[str] = []
    for child_id in node["children"]:
        result.extend(descendants(child_id, nodes))
    return result


def validate(document: dict[str, Any]) -> None:
    if document.get("schema_version") != "0.1.0":
        fail("expected schema_version 0.1.0")
    if document.get("provenance", {}).get("text_authority") != "TR1894":
        fail("text_authority must be TR1894")
    provenance = document["provenance"]
    if provenance.get("text_source") != "source/greek/TR1894/tr1894.txt":
        fail("text_source must be the local Biblia-LBF TR1894 text file")
    actual_hash = hashlib.sha256(TR_TEXT.read_bytes()).hexdigest()
    if provenance.get("text_sha256") != actual_hash:
        fail("text_sha256 does not match the local Biblia-LBF TR1894 text file")

    tokens = document.get("tokens", [])
    token_ids = [token.get("token_id") for token in tokens]
    if not tokens or len(token_ids) != len(set(token_ids)):
        fail("token IDs must be present and unique")
    if any(not isinstance(token.get("source_ordinal"), int) or token["source_ordinal"] < 1 for token in tokens):
        fail("every token needs a positive source_ordinal")

    by_ref: dict[str, list[dict[str, Any]]] = {}
    for token in tokens:
        by_ref.setdefault(token["source_ref"], []).append(token)
    verses = source_verses()
    for reference, verse_tokens in by_ref.items():
        if reference not in verses:
            fail(f"{reference}: not found in {TR_TEXT}")
        ordered = sorted(verse_tokens, key=lambda token: token["source_ordinal"])
        if [token["source_ordinal"] for token in ordered] != list(range(1, len(ordered) + 1)):
            fail(f"{reference}: source ordinals must be consecutive from 1")
        reconstructed = "".join(token["surface_source"] + token.get("after", "") for token in ordered)
        if reconstructed != verses[reference]:
            fail(
                f"{reference}: source reconstruction differs\n"
                f"expected: {verses[reference]}\n"
                f"actual:   {reconstructed}"
            )

    node_rows = document.get("nodes", [])
    nodes = {node.get("node_id"): node for node in node_rows}
    if len(nodes) != len(node_rows) or None in nodes:
        fail("node IDs must be present and unique")

    parents = {node_id: 0 for node_id in nodes}
    for node_id, node in nodes.items():
        is_word = node.get("kind") == "word"
        children = node.get("children")
        if is_word:
            if "token_id" not in node or children is not None:
                fail(f"{node_id}: word nodes need token_id and no children")
            continue
        if "token_id" in node or not isinstance(children, list) or not children:
            fail(f"{node_id}: non-word nodes need children and no token_id")
        for child_id in children:
            if child_id not in nodes:
                fail(f"{node_id}: missing child {child_id}")
            parents[child_id] += 1

    sentence_roots = {sentence.get("root_node_id") for sentence in document.get("sentences", [])}
    if not sentence_roots or not sentence_roots.issubset(nodes):
        fail("each sentence must name an existing root node")
    for node_id, count in parents.items():
        expected = 0 if node_id in sentence_roots else 1
        if count != expected:
            fail(f"{node_id}: expected {expected} parent(s), found {count}")

    def walk(node_id: str, stack: set[str]) -> None:
        if node_id in stack:
            fail(f"cycle at {node_id}")
        node = nodes[node_id]
        if node["kind"] != "word":
            for child_id in node["children"]:
                walk(child_id, stack | {node_id})

    for root_id in sentence_roots:
        walk(root_id, set())

    covered = [token_id for root_id in sentence_roots for token_id in descendants(root_id, nodes)]
    if sorted(covered) != sorted(token_ids) or len(covered) != len(set(covered)):
        fail("every token must occur exactly once in sentence-tree terminals")

    for clause in document.get("clauses", []):
        clause_id = clause.get("clause_id")
        if clause_id not in nodes or nodes[clause_id].get("kind") != "clause":
            fail(f"{clause_id}: clause index must target a clause node")
        if clause.get("token_ids") != descendants(clause_id, nodes):
            fail(f"{clause_id}: clause token_ids differ from canonical node yield")
        clause_yield = "".join(
            next(token for token in tokens if token["token_id"] == token_id)["surface_source"]
            + next(token for token in tokens if token["token_id"] == token_id).get("after", "")
            for token_id in clause["token_ids"]
        )
        # A clause can end immediately before another clause in the same source
        # verse. Preserve that whitespace in the source-token layer, but do not
        # require invisible trailing whitespace in the human-readable index.
        if clause_yield.rstrip() != clause.get("text"):
            fail(f"{clause_id}: clause text differs from its token yield")

    reconciliation = document.get("morphology_reconciliation")
    if reconciliation is not None:
        upstream = utr_tokens()
        bound: dict[str, set[int]] = {}
        for token in tokens:
            morphology = token.get("morphology", {})
            ordinal = morphology.get("source_token_ordinal")
            if not isinstance(ordinal, int):
                fail(f"{token['token_id']}: missing morphology source_token_ordinal")
            reference = token["source_ref"]
            if reference not in upstream or ordinal < 1 or ordinal > len(upstream[reference]):
                fail(f"{token['token_id']}: UTR morphology source position is invalid")
            source_token = upstream[reference][ordinal - 1]
            if morphology.get("source_surface_beta") != source_token["surface_beta"]:
                fail(f"{token['token_id']}: UTR beta surface does not match its source position")
            if morphology.get("raw_tag") != source_token["raw_tag"]:
                fail(f"{token['token_id']}: UTR raw tag does not match its source position")
            bound.setdefault(reference, set()).add(ordinal)

        unbound: dict[str, set[int]] = {}
        for item in reconciliation.get("unbound_utr_tokens", []):
            reference = item.get("source_ref")
            ordinal = item.get("source_token_ordinal")
            if reference not in upstream or not isinstance(ordinal, int) or ordinal < 1 or ordinal > len(upstream[reference]):
                fail("unbound UTR token has an invalid source position")
            source_token = upstream[reference][ordinal - 1]
            if item.get("surface_beta") != source_token["surface_beta"] or item.get("raw_tag") != source_token["raw_tag"]:
                fail("unbound UTR token does not match its source position")
            unbound.setdefault(reference, set()).add(ordinal)

        for reference, source_tokens in upstream.items():
            if reference not in by_ref:
                continue
            covered = bound.get(reference, set()) | unbound.get(reference, set())
            expected = set(range(1, len(source_tokens) + 1))
            if covered != expected or bound.get(reference, set()) & unbound.get(reference, set()):
                fail(f"{reference}: UTR reconciliation must account for each source token exactly once")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("prototype", type=Path)
    args = parser.parse_args()

    try:
        document = json.loads(args.prototype.read_text(encoding="utf-8"))
        validate(document)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"invalid prototype: {error}", file=sys.stderr)
        return 1

    print(f"valid prototype: {args.prototype}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
