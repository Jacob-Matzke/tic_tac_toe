# Design Decisions

Decisions to make before writing code, the tradeoffs in each, and the reasoning
that should drive the choice. Mark each one DECIDED with a date once settled.

---

## How to make these decisions well

Three rules that apply to every choice below:

1. **Prefer the option with a checkable number.** Tic-tac-toe is fully solved and
   its counts are published. Any design where you can assert `len(states) == 5478`
   beats one where you can only eyeball the output.
2. **Prefer the option that leaves an artifact on disk.** If stage 2 writes a file,
   a bug in stage 3 cannot be a bug in stage 2. Pipelines that pass data in memory
   make every bug a whole-program bug.
3. **Defer anything reversible.** Node colors are reversible; state encoding is
   not, because everything downstream is written against it. Spend the thinking
   time on the irreversible ones.

---

## D1. What counts as a "board state"

STATUS: open

Three different populations, and they are not the same size:

- **All assignments.** Every one of `3^9 = 19683` ways to fill 9 cells. Includes
  nonsense like nine X's.
- **Legal reachable positions.** Reachable from the empty board by alternating
  play, where play stops the moment someone wins. This is **5478**.
- **Games / paths.** 255168 distinct playthroughs. Not states, sequences.

The graph wants the middle one. Constraints that define it:

- `count(X) == count(O)` or `count(X) == count(O) + 1` (X moves first)
- not both players have a line
- if a player has a line, the piece counts must be consistent with the game
  having ended on that move

That last constraint is the one people get wrong. A board where X has a line but
four more moves were played afterward satisfies the count rules and is still not
reachable.

**Recommendation:** generate by search from the empty board rather than by
filtering all 19683. Search cannot produce an unreachable state, so the third
constraint enforces itself. Then, separately, write the filter version as a
cross-check and assert the two agree. Two independent methods agreeing on 5478
is much stronger evidence than one method producing it.

---

## D2. State encoding

STATUS: open

| encoding          | example              | notes                                   |
|-------------------|----------------------|-----------------------------------------|
| 9-char string     | `"XOX..O..X"`        | readable, greppable, trivially hashable |
| tuple of 9 ints   | `(1,2,1,0,0,2,...)`  | easy to permute, ugly on disk           |
| base-3 integer    | `7423`               | compact, fast, opaque when debugging    |
| two 9-bit masks   | `(0b101000001, ...)` | fastest win checks, most bug-prone      |

**Recommendation:** 9-char string as the on-disk and canonical form, converted to
a tuple inside the symmetry code. You are dealing with thousands of items, not
millions, so there is no performance argument here. Every hour spent staring at
`7423` wondering what board that is, is an hour lost.

Fix the cell ordering now and write it down: index 0 is top-left, index 8 is
bottom-right, row-major. Half the bugs in this kind of project are an inconsistent
index convention between two files.

---

## D3. The symmetry group

STATUS: open

The square's symmetry group is **D4**, order 8: identity, three rotations
(90/180/270), and four reflections (horizontal, vertical, both diagonals).

Represent each element as a permutation of indices `0..8`, a list of 9 numbers.
Apply it by mapping each output cell to the input cell the permutation names.
Generate the 8 permutations once at import, from one rotate function and one flip
function, then compose. Do not hand-type eight lists of nine numbers; you will
typo one and the bug will be very hard to see.

**Canonical form** = the lexicographic minimum over all 8 transforms. Cheap,
deterministic, and gives you a representative you can print.

Sanity checks:

- the 8 permutations are distinct
- applying any of them to the empty board gives the empty board
- `canon(canon(s)) == canon(s)`
- `canon(g(s)) == canon(s)` for all 8 transforms, for every state

### Optional further collapse: color swap

Swapping X and O is another symmetry of the *board*, but not of the *game*, since
it breaks whose turn it is. It would roughly halve the node count and make the
graph much harder to interpret. **Recommendation: don't**, at least not in v1.

---

## D4. Edges under symmetry

STATUS: open

This is the part worth thinking about carefully before writing it.

Draw an edge `u -> v` when some legal move from a representative of `u` produces
a board whose canonical form is `v`.

This is **well defined**: if `s2 = g(s1)` then the children of `s2` are exactly the
`g`-images of the children of `s1`, and canonicalization erases `g`. So it does not
matter which representative you expand, you get the same set of canonical
children. The multiset is preserved too, so edge *multiplicity* is meaningful:
two distinct moves from `u` can land on the same canonical `v`, and that count is
a real property, not an artifact.

Decide: **collapse parallel edges into one weighted edge, or keep them separate?**
Recommendation: collapse, store `weight`. Multi-edges are invisible in a 3D render
anyway and only make the layout harder.

Structural facts you get for free, and should assert:

- Every edge goes from ply `k` to ply `k+1`. It is a **DAG**. No cycles, no
  self-loops. Assert this. If it fails, canonicalization is broken.
- Terminal nodes (someone won, or board full) have out-degree 0.
- Node count by ply should be 1, 3, 12, 38, 108, 174, 204, 153, 57, 15, summing
  to 765. Verify this yourself rather than trusting the table. If your numbers
  differ, the most likely cause is D1's third constraint.

---

## D5. File formats

STATUS: open

Everything here is small. 765 nodes and roughly two thousand edges is a file you
could open in a text editor. Optimize for legibility, not bytes.

- `states.jsonl` — one JSON object per line. Streamable, diffable, greppable,
  and you can `head` it to see whether stage 1 worked.
- `nodes.json` / `graph.json` — single JSON objects, since the web app loads them
  whole anyway.

Suggested node fields: `id` (canonical string), `ply`, `turn`, `terminal`,
`winner`, `orbit_size` (how many of the 5478 collapse into it). The orbit sizes
must sum to 5478, another free checkpoint.

Suggested edge fields: `source`, `target`, `weight`, `player`.

Check the data files into git. They are small, they are the interesting output,
and versioning them means a regression in the generator shows up as a diff.

---

## D6. Layout

STATUS: open

The graph is a 10-layer DAG. That structure is a gift; use it instead of throwing
a generic force-directed solver at the whole thing.

- **Axis:** ply along one axis (say Y). Layer `k` sits at a fixed height.
- **Within a layer:** this is the actual problem. Options, cheapest first:
  1. Circle, ordered by canonical string. Instant, and looks arbitrary.
  2. Circle, ordered to reduce edge crossings against the previous layer
     (barycenter heuristic: place each node at the average angle of its parents,
     then sort). Cheap and dramatically better.
  3. 2D force simulation per layer, with edges to the already-fixed previous layer
     pulling.
  4. Full 3D force-directed with a strong constraint holding the ply planes flat.

**Recommendation:** start at option 2, and only move on if it looks bad. Layer
sizes peak at 204, so a single circle gets crowded. Consider concentric rings or a
spiral within the large layers.

**Precompute the layout in Python and ship coordinates**, rather than simulating in
the browser. It makes the render deterministic, reloads instant, and lets you
iterate on layout without touching the renderer.

---

## D7. Web stack

STATUS: open

- **three.js + Vite, vanilla JS.** Most control, most learning, nothing between you
  and the scene graph. Recommended given the goals of this project.
- **react-three-fiber.** Nicer if the app grows real UI. More machinery to learn at
  once.
- **3d-force-graph.** Would give a working picture in an afternoon and teach you
  nothing about any of the interesting parts.

Rendering notes for later:

- 765 spheres as individual meshes will work fine, but `InstancedMesh` is the right
  tool and is not much harder.
- All edges in **one** `LineSegments` with a single position buffer. Do not create
  two thousand line objects.
- Do not try to draw 765 legible 3x3 boards at once. Render the board for the
  hovered or selected node in an HTML overlay, or build a small texture atlas of
  board thumbnails and use them as sprites at close zoom.

---

## D8. What the animation actually shows

STATUS: open

"Animated" can mean several things. Pick one as the spine:

- **Growth by ply.** Layers fade in one at a time from the empty board. Reads as
  the game tree unfolding. Best default.
- **A game as a path.** Highlight one playthrough traversing the graph.
- **Idle motion.** Slow camera orbit plus gentle node drift. Cheap, always on.
- **Value propagation.** Solve the game with minimax, then animate win/lose/draw
  values flooding backwards from the terminal layer to the root. This is the one
  that shows something genuinely non-obvious, and it is a natural stage 5 once the
  graph exists.

Coloring options, roughly in increasing order of interest: by ply, by whose turn,
by outcome if terminal, by minimax value under perfect play.

---

## Open questions to answer first

1. D1 — search or filter? (Recommendation: both, and assert they agree.)
2. D2 — lock the index convention and the encoding.
3. D4 — weighted single edges, or parallel edges?
4. D8 — which animation is the spine, so the data model can support it?
