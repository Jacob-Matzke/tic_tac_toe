# Tic-Tac-Toe State Graph

An animated 3D visualization of the graph of tic-tac-toe positions.

Built by hand. See [AI_ROLE.md](AI_ROLE.md).

## Pipeline

Four stages. Each stage reads a file and writes a file, so each one can be
checked on its own before the next is written.

```
stage 1   generate      all legal board states           -> data/states.jsonl
stage 2   canonicalize  collapse under the 8 symmetries  -> data/nodes.json
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

## Status

- [ ] stage 1 generate
- [ ] stage 2 canonicalize
- [ ] stage 3 link
- [ ] stage 4 render
