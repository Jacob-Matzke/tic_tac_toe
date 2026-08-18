import collections
import json
from pathlib import Path

import board
import collapse_symmetry

DATA = Path(__file__).resolve().parent.parent / "data"
STATES_PATH = DATA / "states.jsonl"
NODES_PATH = DATA / "nodes.jsonl"

# Known-correct counts. If any of these fail, the collapse is wrong.
EXPECTED_STATES = 5478
EXPECTED_NODES = 765
EXPECTED_BY_PLY = [1, 3, 12, 38, 108, 174, 204, 153, 57, 15]
EXPECTED_ORBIT_SIZES = {1: 6, 2: 6, 4: 141, 8: 612}


def read_states(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line)["state"] for line in f]


def collapse(states):
    """Map every state to its canonical representative, then build one record per class."""
    canon = {state: min(collapse_symmetry.generate_symmetry(state)) for state in states}

    nodes = {}
    for node_id in set(canon.values()):
        # ply, terminal and winner are identical for every member of an orbit, so the
        # representative speaks for all of them. That is what licenses the collapse.
        nodes[node_id] = {
            "id": node_id,
            "ply": board.get_turns_played(node_id),
            "terminal": board.is_terminal(node_id),
            "winner": board.winner(node_id),
            # Straight from the geometry: how many distinct boards the 8 symmetries
            # produce from this one.
            "orbit_size": len(collapse_symmetry.generate_symmetry(node_id)),
        }

    return canon, nodes


def check(states, canon, nodes):
    assert len(states) == EXPECTED_STATES, f"expected {EXPECTED_STATES} states, got {len(states)}"
    assert len(nodes) == EXPECTED_NODES, f"expected {EXPECTED_NODES} nodes, got {len(nodes)}"

    # orbit_size two independent ways: from the geometry above, and by counting how many
    # states actually landed on each representative. These cannot share a bug.
    counted = collections.Counter(canon.values())
    for node_id, node in nodes.items():
        assert node["orbit_size"] == counted[node_id], (
            f"orbit size disagrees for {node_id}: geometry {node['orbit_size']}, counted {counted[node_id]}"
        )

    total = sum(node["orbit_size"] for node in nodes.values())
    assert total == EXPECTED_STATES, f"orbit sizes sum to {total}, not {EXPECTED_STATES}"

    # Orbit-stabiliser: an orbit's size is 8 / |stabiliser|, so it must divide 8.
    # A size of 3 or 5 means a permutation is broken.
    assert all(8 % node["orbit_size"] == 0 for node in nodes.values()), "an orbit size does not divide 8"
    sizes = dict(sorted(collections.Counter(node["orbit_size"] for node in nodes.values()).items()))
    assert sizes == EXPECTED_ORBIT_SIZES, f"orbit size distribution: {sizes}"

    by_ply = [0] * 10
    for node in nodes.values():
        by_ply[node["ply"]] += 1
    assert by_ply == EXPECTED_BY_PLY, f"nodes per ply: {by_ply}"

    for state in states:
        node_id = canon[state]
        # The representative is its own canonical form.
        assert canon[node_id] == node_id, f"representative is not its own canon: {node_id}"
        # Every board in an orbit collapses to the same node.
        for image in collapse_symmetry.generate_symmetry(state):
            assert canon[image] == node_id, f"orbit of {state} did not collapse together"

    print(f"all checks passed: {len(states)} states -> {len(nodes)} nodes")


def write_nodes(nodes, path):
    # Sorted so a regeneration is byte-identical unless behaviour actually changed.
    ordered = sorted(nodes.values(), key=lambda node: (node["ply"], node["id"]))

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for node in ordered:
            f.write(json.dumps(node, sort_keys=True) + "\n")

    print(f"wrote {len(ordered)} nodes to {path}")


def main():
    states = read_states(STATES_PATH)
    canon, nodes = collapse(states)
    check(states, canon, nodes)
    write_nodes(nodes, NODES_PATH)


if __name__ == "__main__":
    main()
