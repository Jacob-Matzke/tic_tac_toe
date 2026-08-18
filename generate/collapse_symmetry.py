# Gather tables: g[k] is the index of the cell in s that supplies output position k.
# Apply one with ''.join([s[i] for i in g]).
IDENTITY = tuple(range(9))
ROT = (2, 5, 8, 1, 4, 7, 0, 3, 6)   # 90 degrees counter-clockwise
FLIP = (6, 7, 8, 3, 4, 5, 0, 1, 2)  # reflect about the horizontal axis


def compose(p, q):
    """Table for applying p first, then q. Same shape as applying a table to a string."""
    return tuple(p[i] for i in q)


def _build_permutations():
    # Every symmetry of the square is n rotations followed by an optional flip.
    # Derived rather than typed out, so a typo in ROT or FLIP fails an assert below
    # instead of quietly producing a plausible wrong answer.
    out = {}
    rotated = IDENTITY
    for name in ('e', 'r', 'r2', 'r3'):
        out[name] = rotated
        out[('' if name == 'e' else name) + 'f'] = compose(rotated, FLIP)
        rotated = compose(rotated, ROT)
    return out


permutations = _build_permutations()

assert len(set(permutations.values())) == 8, "the generators do not produce all of D4"
assert all(sorted(p) == list(range(9)) for p in permutations.values()), "not a permutation"
assert all(p[4] == 4 for p in permutations.values()), "the center must be fixed"
assert compose(compose(ROT, ROT), compose(ROT, ROT)) == IDENTITY, "ROT^4 must be the identity"


def generate_symmetry(s):
    symmetries = set()
    for perm in permutations.values():
        symmetries.add(''.join([s[i] for i in perm]))
    return symmetries
