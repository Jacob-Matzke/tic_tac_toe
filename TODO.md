# Stage 1 checklist

Get from the current game-tree walker to `data/states.jsonl`. Six steps, each with
something to check before moving to the next.

After this, stage 2 (symmetry collapse) is all yours.

---

## 1. Fix the color inversion

**Change.** Delete the `current_player` field and the constructor argument. Add a
method that derives whose turn it is from `turns_played`: even means X to move,
odd means O.

**Why.** The stored field says "who just moved" but the root is built claiming X
already moved on an empty board, so O opens. Derived from the state, there is no
root special case and the value cannot drift out of sync with the board.

**Verify.** The first child of the empty board contains an `X`. Every state
satisfies `count(X) == count(O)` or `count(X) == count(O) + 1`.

**Done 2026-08-17**, by flipping the constructor default rather than deriving.
Correct, but the redundant field survives; it disappears in step 3.

---

## 2. Add a winner method

**Change.** A method returning `'X'`, `'O'`, or `None`. The win loops already
find the line; return the mark instead of `True`. Keep `is_terminal` as
`winner() is not None or '.' not in state`.

**Why.** Do this before writing any file. `winner` is a field in the output, and
discovering later that a draw is indistinguishable from a win means regenerating
everything downstream.

**Verify.** No state has both a line for X and a line for O. If X has a line,
`count(X) == count(O) + 1`; if O has a line, `count(X) == count(O)`.

---

## 3. Replace Board with functions on strings

**Change.** `board.py` becomes a module of pure functions over 9-char strings:
`ply(s)`, `to_move(s)`, `winner(s)`, `is_terminal(s)`, `empties(s)`,
`apply_move(s, i, mark)`. The class, `parent`, `children`, `add_child`, and
`current_player` all go. A module-level tuple of the 8 winning index triples
collapses the four near-identical win loops into one.

**Why.** Once the tree links are gone, every remaining attribute is derived from
the state string, so the object encapsulates nothing. Stage 2's symmetry ops are
natively string-to-string and compose directly as functions:
`canon(apply_move(s, i, 'X'))`. This module becomes the shared vocabulary for all
three Python stages.

A per-node record does come back at stage 3, holding `orbit_size`, layout
coordinates and minimax `value` - things that cannot be recomputed from the state
string. A class earns its place when it holds something the key does not
determine. Nothing in stage 1 qualifies.

**Verify.** `board.py` has no `class`. Counts still come out the same.

---

## 4. Dedup the search

**Change.** Replace `active_states` and `terminal_states` with a `seen` set of
state strings, plus a queue. Enqueue a child only if its string is not
already in `seen`. Insert into `seen` at creation time, not at dequeue time. Skip
expansion of terminal states.

**Why.** This is the tree-to-graph step. Everything else in this list is cleanup
around it.

**Verify.** `len(seen) == 5478`.

---

## 5. Assert the counts

**Change.** Fail loudly rather than printing. Counts per ply and the total.

**Why.** These are the numbers that make every later stage checkable. An assert
that runs on every generation is worth more than a number you eyeballed once.

**Verify.**

| quantity           | expected                                     |
|--------------------|----------------------------------------------|
| total states       | 5478                                         |
| states per ply     | 1, 9, 72, 252, 756, 1260, 1520, 1140, 390, 78 |
| terminal states    | 958                                          |
| X wins             | 626                                          |
| O wins             | 316                                          |
| draws              | 16                                           |

The per-ply figures sum to 5478 and the three outcome figures sum to 958. Check
both sums rather than trusting the table.

---

## 6. Write states.jsonl

**Change.** One JSON object per line:

```
{"state": "XOX..O..X", "ply": 5, "terminal": false, "winner": null}
```

Sort by `(ply, state)` before writing.

**Why sorted.** The data files are checked into git. Dict iteration order shifts
between runs, so an unsorted file turns every regeneration into a 5478-line diff
and you lose the ability to see what actually changed. Sorted, a regeneration is
byte-identical unless behavior really changed.

Do not pickle Board objects. The file is the interface between stages: readable
by stage 2, greppable by you, and unaffected by renaming a field on the class.

**Verify.** `wc -l` gives 5478. First line is the empty board. `head` looks like
boards.

---

## Then

Stage 2: the 8 D4 permutations, `canon()`, collapse 5478 to 765. See D3 and D4 in
DESIGN.md.
