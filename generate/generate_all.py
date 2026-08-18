import json
from pathlib import Path

import board

# Anchored to this file, not the current directory, so output lands in the same
# place no matter where python is invoked from.
STATES_PATH = Path(__file__).resolve().parent.parent / "data" / "states.jsonl"

# Known-correct counts for tic-tac-toe. If any of these fail, the generator is wrong.
EXPECTED_TOTAL = 5478
EXPECTED_BY_PLY = [1, 9, 72, 252, 756, 1260, 1520, 1140, 390, 78]
EXPECTED_TERMINAL = 958
EXPECTED_OUTCOMES = {'X': 626, 'O': 316, None: 16}  # X wins, O wins, draws


def check(seen, enqueues):
    # Every state was created exactly once. This is the only check that can catch a
    # dedup regression; the total below comes out at 5478 either way.
    assert enqueues == len(seen), f"dedup leak: {enqueues} enqueues for {len(seen)} states"

    assert len(seen) == EXPECTED_TOTAL, f"expected {EXPECTED_TOTAL} states, got {len(seen)}"

    by_ply = [0] * 10
    for state in seen:
        by_ply[board.get_turns_played(state)] += 1
    assert by_ply == EXPECTED_BY_PLY, f"states per ply: {by_ply}"

    terminal = [state for state in seen if board.is_terminal(state)]
    assert len(terminal) == EXPECTED_TERMINAL, f"expected {EXPECTED_TERMINAL} terminal, got {len(terminal)}"

    outcomes = {'X': 0, 'O': 0, None: 0}
    for state in terminal:
        outcomes[board.winner(state)] += 1
    assert outcomes == EXPECTED_OUTCOMES, f"outcomes: {outcomes}"

    # X moves first. Neither count above ever notices this, since swapping the two
    # players leaves every one of them unchanged.
    assert board.get_current_player('.........') == 'X', "O is moving first"

    for state in seen:
        x, o = state.count('X'), state.count('O')
        assert x == o or x == o + 1, f"illegal piece counts: {state}"

    # A won game stopped on the winning move, so the winner played last.
    for state in terminal:
        x, o = state.count('X'), state.count('O')
        won_by = board.winner(state)
        if won_by == 'X':
            assert x == o + 1, f"X won but did not move last: {state}"
        elif won_by == 'O':
            assert x == o, f"O won but did not move last: {state}"

    print(f"all checks passed: {len(seen)} states, {len(terminal)} terminal")


def write_states(seen, path):
    # Sorted so a regeneration is byte-identical unless behaviour actually changed.
    # Set iteration order is randomised per process, so unsorted output churns
    # every line on every run and makes the git diff useless.
    ordered = sorted(seen, key=lambda state: (board.get_turns_played(state), state))

    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for state in ordered:
            record = {
                "state": state,
                "ply": board.get_turns_played(state),
                "terminal": board.is_terminal(state),
                "winner": board.winner(state),
            }
            f.write(json.dumps(record, sort_keys=True) + "\n")

    print(f"wrote {len(ordered)} states to {path}")


def main():
    seen = set()
    queue = set()

    root_board = '.........'

    queue.add(root_board)
    seen.add(root_board)  # 'seen' means enqueued, not dequeued
    enqueues = 1  # counts states created, to prove the dedup guard is doing the work

    while queue:
        current_board = queue.pop()

        if board.is_terminal(current_board):  # Check if the game is over
            continue

        for index in board.get_empty_indices(current_board):
            player_mark = board.get_current_player(current_board)
            new_board = current_board[:index] + player_mark + current_board[index + 1:]
            if new_board not in seen:
                queue.add(new_board)
                seen.add(new_board)
                enqueues += 1

    check(seen, enqueues)
    write_states(seen, STATES_PATH)

if __name__ == "__main__":
    main()