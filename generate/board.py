class Board:

    # Initialize the board with a given state and parent node
    def __init__(self, parent, state, current_player='O'):
        self.parent = parent
        self.state = state
        self.children = []
        self.turns_played = state.count('X') + state.count('O')  # Count the number of turns played based on the state
        self.current_player = current_player  # Set the current player

    # Simple getters and setters
    def add_child(self, child):
        self.children.append(child)

    def get_children(self):
        return self.children

    def get_state(self):
        return self.state

    def get_parent(self):
        return self.parent

    def get_turns_played(self):
        return self.turns_played

    # Check if the board is a terminal state (win/loss/draw)
    def is_terminal(self):

        # Check for a win condition
        ## Check rows
        for i in range(3):
            if self.state[i*3] == self.state[i*3 + 1] == self.state[i*3 + 2] != '.':
                return True  # A player has won

        ## Check columns
        for i in range(3):
            if self.state[i] == self.state[i + 3] == self.state[i + 6] != '.':
                return True  # A player has won

        ## Check diagonal A
        if self.state[0] == self.state[4] == self.state[8] != '.':
            return True  # A player has won

        ## Check diagonal B
        if self.state[2] == self.state[4] == self.state[6] != '.':
            return True  # A player has won

        # Check for a tie (no empty spaces left)
        if '.' not in self.state:
            return True  # No empty spaces left, it's a draw

        # Else game is ongoing
        return False

    def get_empty_indices(self):
        return [i for i, cell in enumerate(self.state) if cell == '.']