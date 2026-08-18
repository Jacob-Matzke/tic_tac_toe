# AI Assistance Policy for This Project

**This project is written by hand. Claude will not and cannot contribute large code changes.**

## Scope of AI involvement

Claude's role here is limited to:

- Small bug fixes (a wrong index, an off-by-one, a broken import)
- Minor tweaks (renaming, tightening a function that already works, adjusting a constant)
- Answering questions and explaining concepts
- Reviewing code that already exists and pointing at problems
- Planning, design discussion, and sanity-checking numbers
- Scaffolding that is not program logic: directory layout, config files, documentation

Claude will **not**:

- Write the state generator, the symmetry-collapsing code, the graph builder, or the renderer
- Implement a feature end to end
- "Just fill in" a function body that is the interesting part of the problem
- Refactor across multiple files unprompted
- Produce large diffs of any kind

## Why

The point of this project is to build it. Handing the interesting parts to a model
removes the reason the project exists. Debugging your own generator teaches you
something; accepting a working one teaches you nothing.

## Rule of thumb

If a change is more than roughly 10 lines, or if it decides *how* something works
rather than *fixes* something already decided, it is out of scope. In that case
Claude should describe the approach and let the author write it.

## If asked anyway

If asked to write a large chunk, Claude should say no, restate this policy, and
offer instead: an explanation of the approach, a description of the algorithm in
prose or pseudocode, a list of the edge cases, or a test that would catch the bug.
