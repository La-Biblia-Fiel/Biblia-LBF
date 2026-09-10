# Syntax prototypes

These fixtures are intentionally small, manually authored research examples. They are not a complete NT corpus and are not canonical LBF translation or alignment data.

Run the source and tree checks from the repository root:

```sh
python3 tools/validate_syntax_prototype.py prototypes/matthew-1-1.syntax.json
```

The validator checks source reconstruction against the local TR1894 verse text, token identity/order, tree parentage and coverage, and clause-index agreement. It does not authorize a full-corpus import or infer clause decisions.

`matthew-1-18-25.syntax.json` is the bounded complex-passage fixture. It
records every local TR terminal and every local UTR morphology position; eight
UTR-only tokens are explicitly unbound. Its manually reviewed nested clause
tree is documented in `MATTHEW_1_18_25_COMPLEXITY.md` and is validated against
the source-token, terminal-coverage, tree, and clause-index checks.
