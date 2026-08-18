"""Stage 3: link the canonical nodes into a directed graph.

Reads data/nodes.jsonl, expands one representative per node, and writes
data/graph.json with edges, minimax values and precomputed 3D layout coordinates.
"""
import collections
import json
import math
from pathlib import Path

import board
import collapse_symmetry

DATA = Path(__file__).resolve().parent.parent / "data"
STATES_PATH = DATA / "states.jsonl"
NODES_PATH = DATA / "nodes.jsonl"
GRAPH_PATH = DATA / "graph.json"
RAW_GRAPH_PATH = DATA / "raw_graph.json"

EXPECTED_NODES = 765
EXPECTED_BY_PLY = [1, 3, 12, 38, 108, 174, 204, 153, 57, 15]

ROOT = "........."

# Layout tuning
LAYER_HEIGHT = 9.0      # vertical gap between plies
NODE_SPACING = 1.35     # target arc length between neighbours in a ring
MIN_RADIUS = 2.0


def canon(state):
    return min(collapse_symmetry.generate_symmetry(state))


def read_nodes(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def build_edges(nodes):
    """One edge per (source, canonical target), weighted by how many moves land on it.

    Expanding a single representative is what makes the weights right: every
    representative of a class has the same multiset of canonical children, so
    expanding all of them would just inflate every weight by the orbit size.
    """
    edges = []
    for node in nodes:
        if node["terminal"]:
            continue

        source = node["id"]
        mark = board.get_current_player(source)

        targets = collections.Counter()
        for index in board.get_empty_indices(source):
            child = source[:index] + mark + source[index + 1:]
            targets[canon(child)] += 1

        for target, weight in sorted(targets.items()):
            edges.append({"source": source, "target": target, "weight": weight, "player": mark})

    return edges


def solve(nodes, edges):
    """Minimax value from X's perspective: +1 X wins, 0 draw, -1 O wins.

    Reverse ply order is a topological order because every edge goes from ply k to
    ply k+1, so one backward pass is enough.
    """
    children = collections.defaultdict(list)
    for edge in edges:
        children[edge["source"]].append(edge["target"])

    value = {}
    for node in sorted(nodes, key=lambda n: -n["ply"]):
        node_id = node["id"]
        if node["terminal"]:
            value[node_id] = {"X": 1, "O": -1, None: 0}[node["winner"]]
        else:
            scores = [value[child] for child in children[node_id]]
            value[node_id] = max(scores) if board.get_current_player(node_id) == "X" else min(scores)

    return value


def layout(nodes, edges):
    """Ply on the Y axis; within a ply, a ring ordered by the barycentre heuristic.

    Each node is placed at the average angle of its parents, then the layer is sorted
    by that angle and spread evenly. Cheap, and it keeps edges from crossing the ring.
    """
    parents = collections.defaultdict(list)
    for edge in edges:
        parents[edge["target"]].append(edge["source"])

    by_ply = collections.defaultdict(list)
    for node in nodes:
        by_ply[node["ply"]].append(node["id"])

    angle = {}
    position = {}

    for ply in sorted(by_ply):
        layer = by_ply[ply]

        if ply == 0:
            ordered = layer
        else:
            def barycentre(node_id):
                # circular mean of the parents' angles
                mine = [angle[p] for p in parents[node_id]]
                x = sum(math.cos(a) for a in mine)
                y = sum(math.sin(a) for a in mine)
                return math.atan2(y, x)

            ordered = sorted(layer, key=lambda n: (barycentre(n), n))

        count = len(ordered)
        radius = 0.0 if count == 1 else max(MIN_RADIUS, count * NODE_SPACING / (2 * math.pi))

        for i, node_id in enumerate(ordered):
            theta = 2 * math.pi * i / count
            angle[node_id] = theta
            position[node_id] = (
                radius * math.cos(theta),
                -ply * LAYER_HEIGHT,          # root on top, game descends
                radius * math.sin(theta),
            )

    return position


def check(nodes, edges, value):
    assert len(nodes) == EXPECTED_NODES, f"expected {EXPECTED_NODES} nodes, got {len(nodes)}"

    by_id = {node["id"]: node for node in nodes}
    by_ply = [0] * 10
    for node in nodes:
        by_ply[node["ply"]] += 1
    assert by_ply == EXPECTED_BY_PLY, f"nodes per ply: {by_ply}"

    out_weight = collections.Counter()
    out_degree = collections.Counter()
    for edge in edges:
        assert edge["source"] in by_id, f"unknown source {edge['source']}"
        assert edge["target"] in by_id, f"unknown target {edge['target']}"
        # Every edge advances exactly one ply, so the graph is a DAG by construction.
        assert by_id[edge["target"]]["ply"] == by_id[edge["source"]]["ply"] + 1, (
            f"edge does not advance one ply: {edge['source']} -> {edge['target']}"
        )
        assert edge["weight"] >= 1
        out_weight[edge["source"]] += edge["weight"]
        out_degree[edge["source"]] += 1

    # No duplicate (source, target) pairs; parallel moves were collapsed into weights.
    pairs = [(edge["source"], edge["target"]) for edge in edges]
    assert len(pairs) == len(set(pairs)), "duplicate edges"

    for node in nodes:
        empties = node["id"].count(".")
        if node["terminal"]:
            assert out_degree[node["id"]] == 0, f"terminal node has children: {node['id']}"
        else:
            # The invariant that catches a broken canonicalisation: the weights leaving a
            # node must account for every legal move from it.
            assert out_weight[node["id"]] == empties, (
                f"out-weights {out_weight[node['id']]} != {empties} empty cells for {node['id']}"
            )

    # Every node except the root is reachable.
    has_parent = {edge["target"] for edge in edges}
    orphans = [node["id"] for node in nodes if node["id"] != ROOT and node["id"] not in has_parent]
    assert not orphans, f"unreachable nodes: {orphans[:3]}"
    assert ROOT not in has_parent, "the empty board should have no parents"

    # The empty board has three children weighted 4, 4, 1 (corner, edge, centre).
    root_weights = sorted(e["weight"] for e in edges if e["source"] == ROOT)
    assert root_weights == [1, 4, 4], f"root edge weights: {root_weights}"

    # Perfect play from the empty board is a draw. If any of the graph on the principal
    # variation is wrong, this is what notices.
    assert value[ROOT] == 0, f"the empty board should be a draw, got {value[ROOT]}"

    print(f"all checks passed: {len(nodes)} nodes, {len(edges)} edges")


def write_graph(nodes, edges, value, position, path):
    index = {node["id"]: i for i, node in enumerate(sorted(nodes, key=lambda n: (n["ply"], n["id"])))}
    ordered = sorted(nodes, key=lambda n: (n["ply"], n["id"]))

    payload = {
        "nodes": [
            {
                "id": node["id"],
                "ply": node["ply"],
                "terminal": node["terminal"],
                "winner": node["winner"],
                "orbit_size": node["orbit_size"],
                "value": value[node["id"]],
                "pos": [round(c, 4) for c in position[node["id"]]],
            }
            for node in ordered
        ],
        "edges": [
            {
                "source": index[edge["source"]],
                "target": index[edge["target"]],
                "weight": edge["weight"],
                "player": edge["player"],
            }
            for edge in sorted(edges, key=lambda e: (index[e["source"]], index[e["target"]]))
        ],
    }

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, indent=1, sort_keys=True)
        f.write("\n")

    print(f"wrote {len(payload['nodes'])} nodes and {len(payload['edges'])} edges to {path}")


# ------------------------------------------------------------- raw (uncollapsed)

RAW_SPACING = 1.15      # arc length between neighbours within a ring
RAW_RING_GAP = 2.6      # radial gap between concentric rings
RAW_BASE_RADIUS = 4.0


def build_raw_graph(value):
    """The full 5478-state graph, before symmetry collapse.

    Values are inherited from the canonical solve: symmetric positions have equal
    game value, so value(s) = value(canon(s)).
    """
    with open(STATES_PATH, encoding="utf-8") as f:
        records = [json.loads(line) for line in f]
    records.sort(key=lambda r: (r["ply"], r["state"]))

    states = [r["state"] for r in records]
    state_set = set(states)
    index = {s: i for i, s in enumerate(states)}

    edges = []
    for record in records:
        if record["terminal"]:
            continue
        source = record["state"]
        mark = board.get_current_player(source)
        for i in board.get_empty_indices(source):
            child = source[:i] + mark + source[i + 1:]
            assert child in state_set, f"raw child not in states: {child}"
            edges.append((source, child))
    edges.sort(key=lambda e: (index[e[0]], index[e[1]]))

    # Layers of up to 1520 nodes will not fit one ring: fill concentric rings outward,
    # in barycentre order so children still sit near their parents' angles.
    parents = collections.defaultdict(list)
    for source, target in edges:
        parents[target].append(source)

    by_ply = collections.defaultdict(list)
    for record in records:
        by_ply[record["ply"]].append(record["state"])

    angle = {}
    position = {}
    for ply in sorted(by_ply):
        layer = by_ply[ply]
        if ply == 0:
            ordered = layer
        else:
            def barycentre(state):
                mine = [angle[p] for p in parents[state]]
                x = sum(math.cos(a) for a in mine)
                y = sum(math.sin(a) for a in mine)
                return math.atan2(y, x)
            ordered = sorted(layer, key=lambda s: (barycentre(s), s))

        remaining = len(ordered)
        placed = 0
        radius = 0.0 if remaining == 1 else RAW_BASE_RADIUS
        ring = 0
        while placed < len(ordered):
            capacity = max(1, int(2 * math.pi * radius / RAW_SPACING)) if radius else 1
            chunk = ordered[placed:placed + capacity]
            offset = 0.4 * ring  # stagger rings so nodes do not align radially
            for j, state in enumerate(chunk):
                theta = 2 * math.pi * j / len(chunk) + offset
                angle[state] = theta
                position[state] = (
                    radius * math.cos(theta),
                    -ply * LAYER_HEIGHT,
                    radius * math.sin(theta),
                )
            placed += len(chunk)
            radius += RAW_RING_GAP
            ring += 1

    nodes = [
        {
            "id": r["state"],
            "ply": r["ply"],
            "terminal": r["terminal"],
            "winner": r["winner"],
            "value": value[canon(r["state"])],
            "pos": [round(c, 4) for c in position[r["state"]]],
        }
        for r in records
    ]
    edge_list = [{"source": index[a], "target": index[b]} for a, b in edges]
    return nodes, edge_list


def check_raw(raw_nodes, raw_edges, nodes, edges):
    assert len(raw_nodes) == 5478, f"expected 5478 raw nodes, got {len(raw_nodes)}"

    # Independent count of the raw edges: every raw member of a class u contributes
    # weight(u->v) edges into the orbit of v, so raw edge total = sum of w * orbit(u).
    orbit = {node["id"]: node["orbit_size"] for node in nodes}
    expected = sum(e["weight"] * orbit[e["source"]] for e in edges)
    assert len(raw_edges) == expected, f"raw edges {len(raw_edges)}, expected {expected}"

    for e in raw_edges:
        assert raw_nodes[e["target"]]["ply"] == raw_nodes[e["source"]]["ply"] + 1

    root_children = sum(1 for e in raw_edges if e["source"] == 0)
    assert root_children == 9, f"raw root should have 9 children, got {root_children}"

    print(f"raw checks passed: {len(raw_nodes)} nodes, {len(raw_edges)} edges")


def write_raw_graph(raw_nodes, raw_edges, path):
    payload = {"nodes": raw_nodes, "edges": raw_edges}
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, sort_keys=True, separators=(",", ":"))
        f.write("\n")
    print(f"wrote {len(raw_nodes)} raw nodes and {len(raw_edges)} raw edges to {path}")


def main():
    nodes = read_nodes(NODES_PATH)
    edges = build_edges(nodes)
    value = solve(nodes, edges)
    position = layout(nodes, edges)
    check(nodes, edges, value)
    write_graph(nodes, edges, value, position, GRAPH_PATH)

    raw_nodes, raw_edges = build_raw_graph(value)
    check_raw(raw_nodes, raw_edges, nodes, edges)
    write_raw_graph(raw_nodes, raw_edges, RAW_GRAPH_PATH)


if __name__ == "__main__":
    main()
