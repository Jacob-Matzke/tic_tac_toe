# Tic-Tac-Toe State Graph

An animated 3D visualization of the graph of tic-tac-toe positions.

Built by hand. See [AI_ROLE.md](AI_ROLE.md).

## Pipeline

Four stages. Each stage reads a file and writes a file, so each one can be
checked on its own before the next is written.

```
stage 1   generate      all legal board states           -> data/states.jsonl
stage 2   canonicalize  collapse under the 8 symmetries  -> data/nodes.jsonl
stage 3   link          build directed edges by ply      -> data/graph.json
stage 4   render        3D animated web app              -> web/
```

## Layout

```
generate/   python for stages 1-3
data/       generated artifacts (checked in; they are small)
web/        the viewer
```

## Checkpoints

Known-correct numbers to validate each stage against. See DESIGN.md.

| quantity                                     | expected |
|----------------------------------------------|----------|
| all 3^9 cell assignments                     | 19683    |
| legal reachable states (play stops at a win) | 5478     |
| unique under rotation + reflection           | 765      |

Per-stage invariants worth asserting as you go:

- nodes per ply: 1, 3, 12, 38, 108, 174, 204, 153, 57, 15
- orbit sizes sum to 5478
- for any non-terminal node, out-edge weights sum to its empty-cell count
- the empty board has 3 children with weights 4, 4, 1 (corner, edge, center)
- every edge goes ply k -> k+1, so the graph is a DAG
- if you compute minimax values: the empty board is a DRAW

## Status

- [x] stage 1 generate -> data/states.jsonl (5478 states)
- [x] stage 2 canonicalize -> data/nodes.jsonl (765 nodes)
- [ ] stage 3 link
- [ ] stage 4 render
