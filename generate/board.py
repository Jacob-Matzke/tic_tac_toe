# Return the indices of empty cells in the board state
def get_empty_indices(s):
        return [i for i, cell in enumerate(s) if cell == '.']

def is_tie(s):
    # Check for a tie (no empty spaces left)
    if '.' not in s:
        return True # No empty spaces left, it's a draw

    return False

def winner(s):

    ## Check rows
    for i in range(3):
        if s[i*3] == s[i*3 + 1] == s[i*3 + 2] != '.':
            return s[i*3]  # A player has won

    ## Check columns
    for i in range(3):
        if s[i] == s[i + 3] == s[i + 6] != '.':
            return s[i]  # A player has won

    ## Check diagonal A
    if s[0] == s[4] == s[8] != '.':
        return s[0]  # A player has won

    ## Check diagonal B
    if s[2] == s[4] == s[6] != '.':
        return s[2]  # A player has won

    return None  # Nobody has a line. Whether the game is over is is_terminal's question.

# Check if the game is over (either a win or a tie)
def is_terminal(s):
    return winner(s) is not None or is_tie(s)

# Get the number of turns played based on the current board state
def get_turns_played(s):
    return 9 - len(get_empty_indices(s))  # Count the number of turns played based on the state

# Get the current player based on the number of turns played
def get_current_player(s):
    return 'X' if get_turns_played(s) % 2 == 0 else 'O'  # Determine the current player based on the number of turns played