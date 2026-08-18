from board import Board

def main():
    active_states = [Board(None, '.........')]  # List to hold all active board states
    terminal_states = []  # List to hold all terminal board states

    while active_states:

        current_state = active_states.pop(0)  # Get the first active state

        for index in current_state.get_empty_indices():
            # Create a new state by placing the opponent's mark in the empty index
            player_mark = 'O' if current_state.current_player == 'X' else 'X'
            new_state = current_state.get_state()[:index] + player_mark + current_state.get_state()[index + 1:]
            new_board = Board(current_state, new_state, player_mark)  # Create a new board with the new state
            current_state.add_child(new_board)  # Add the new board as a child of the current state

            if new_board.is_terminal():
                terminal_states.append(new_board)  # If it's a terminal state, add it to the terminal states list
            else:
                active_states.append(new_board)  # If it's not terminal, add it to the active states list

    terminal_by_turns = {i: [] for i in range(10)}  # Dictionary to hold terminal states by number of turns played
    for state in terminal_states:
        for i in range(10):
            if state.get_turns_played() == i:
                terminal_by_turns[i].append(state)

    total_terminal_states = 0
    for turns, states in terminal_by_turns.items():
        print(f"Terminal states after {turns} turns: {len(states)}")
        total_terminal_states += len(states)

    print(f"Total terminal states: {total_terminal_states}")

if __name__ == "__main__":
    main()