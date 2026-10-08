# Hextris engine: behaviour specification

Status: input to the clean-room rewrite (PR T5-3). Read with the T5-3 section of the games T5
plan. This document describes what a player sees and the rules a referee would apply. It is the
only description of the game the engine implementer may use.

Amended for PR T5-4 (game feel): the countdown (3.7), hit-stop (3.8), the idle guard (6.9) and
the opening (10.8, 10.9).

## 1. Board model

1. The board is a hexagon in the centre of the screen with six sides, numbered 0 to 5 going
   clockwise as the player sees them. Side 5 is next to side 0.
2. Each side holds a stack of settled cells. Row 0 touches the hexagon; higher rows are further
   out. A cell has a colour and an optional special (none, bomb or rainbow).
3. There are four colours. A cell with the rainbow special has a backing colour too, but it
   matches any colour (section 6).
4. Pieces fall from beyond the edge of the screen toward the hexagon along a lane. There are six
   lanes, one per side direction. A piece has one colour, an optional special, a lane and a
   distance from the hexagon that shrinks as it falls.
5. The hexagon can be rotated in steps of one side. Rotation changes which side faces which lane.
   A piece lands on whichever side faces its lane at the moment it reaches the top of that
   side's stack. Rotating a piece's lane away from a tall stack in time is the main skill.
6. Cells never move sideways. Within a side they only move down (gravity, section 5).

## 2. Controls

These come from the site-authored key router and are not part of the game rules proper, but the
engine must expose matching actions.

1. Left arrow or A rotates the hexagon one step counter-clockwise. Right arrow or D rotates it
   one step clockwise. Holding a rotation key repeats the rotation.
2. Down arrow or S makes pieces fall four times faster while held, and stops on release.
   Pause, window blur and game over also end the rush; after resuming, the player must press
   rush again.
3. Space or P toggles pause. F triggers Panic Clear when it is available (section 8).
4. Any of Space, Enter, the arrows or A, S, D starts a run from the ready screen. Holding Space
   does not start and then pause.
5. Tapping the left half of the canvas rotates counter-clockwise, the right half clockwise.
6. Rotation and rush do nothing while paused or after game over.
7. The engine takes these as abstract actions (rotate by one step either way, rush on, rush off,
   pause, panic). It does not read the keyboard.
8. During the countdown (section 3.7) rotation and rush work and pause holds the countdown.
   Panic Clear does nothing.

## 3. Falling and landing

1. Pieces spawn at the outer edge at the spawn interval for the current level (section 10).
2. Every piece falls at the fall speed for the current level. Rush multiplies that speed by four
   while held.
3. When a piece reaches the cell directly above the stack on the side facing its lane, it
   settles: it becomes the next cell of that side and stops being a falling piece.
4. If the side's stack is already above the current limit when the piece would settle, the
   piece still settles and game over is checked (section 9).
5. After a piece settles, clearing is checked (section 4). Pieces already in flight keep falling
   while a clear animates; the animation is a painter concern and the simulation applies the
   clear immediately.
6. A piece is never destroyed in flight.
7. Countdown: starting a run does not start play at once. The run first counts down for 2400 ms,
   showing 3, 2 and 1 for 800 ms each, then GO. Nothing spawns or falls before GO. The player
   can rotate during the countdown to get ready, and a rush pressed then carries into play.
   The run clock reads -2400 ms when the run starts and 0 at GO, so elapsed time (section 10.1),
   the boundary timer (section 9.2) and the run's length in seconds all count from GO. A
   rotation during the countdown starts the boundary timer at GO.
8. Hit-stop: a big clear holds the action for a moment. After a clear of 4 or more cells,
   falling pieces stop and nothing spawns for 60 ms; after a chain clear (section 6.4), for
   90 ms. A hit-stop that starts during another lasts until whichever ends later. The run
   clock, the combo window, the level and the boundary timer keep running, rotation still
   works, and the painter keeps animating. A spawn that falls due during the hold comes out
   when it ends. The hold is part of the simulation, so it is deterministic.

## 4. Matching and clearing

1. A group is a set of settled cells of the same colour that are connected. Two cells are
   connected if they are on the same side one row apart, or in the same row on adjacent sides
   (side 5 and side 0 are adjacent).
2. A rainbow cell is connected to a neighbour of any colour and counts as that colour for the
   group it joins. A group started from a rainbow cell takes the colour that gives the largest
   group.
3. A group of three or more cells clears. Groups of one or two do nothing.
4. Only the group containing the cell that just settled is checked after a settle, plus any
   groups formed by gravity afterwards (section 5).
5. If a cleared group contains a bomb, the bomb also clears every cell within two rows of it on
   its own side, and every cell within one row of it on the two adjacent sides. Cleared bomb
   neighbours score like any other cleared cell.
6. All cells in the group and any bomb blast are removed in one step. Each cleared cell counts
   once toward the score and toward the level (section 10). Cells removed by Panic Clear
   (section 8) do not count toward cells cleared or the level.

## 5. Gravity and chains

1. After cells are removed, every cell above a gap in its side drops down to close it. Cells do
   not change side.
2. After gravity, the board is checked again for new groups of three or more. If any form,
   they clear in the same way, one group per pass, until none remain. This is a chain. When
   one pass leaves several separate groups, they clear in successive passes, side 0 upward,
   lowest row first.
3. Each pass of a chain is a separate clear for scoring and the combo window.

## 6. Scoring (kept rules, the leaderboard depends on these)

1. Clear score: the number of cells cleared in one group, squared, times the current combo
   level. A bomb blast counts all cells it removes in that group.
2. The combo level starts at 1.
3. The combo window is the time after a clear during which the next clear counts as a
   continuation. A clear inside the window raises the combo level by 1. A clear outside the
   window sets the level back to 1 before scoring. The window length is set by the level
   (section 10) and is restarted by every clear. On each clear, first update the combo level
   (inside the window +1, a chain +2, outside the window reset to 1), then score with the
   updated level.
4. Chain bonus: a clear that happens within 400 ms of the previous clear raises the combo level
   by 2 instead of 1, and shows a "CHAIN!" label. Gravity chains (section 5) always qualify.
5. Clean sweep: if a clear removes the last remaining cells so that the board is empty, and the
   clear removed at least 10 cells, the player gets a bonus of 1000 times the combo level.
6. Panic clear: 30 points for every settled cell removed (section 8). It is not multiplied by
   the combo level.
7. Score is an integer and never decreases.
8. Persistent storage keys for the high score list are unchanged.
9. Idle guard: a clear scores only while the player is playing. Before the player's first
   input of the run, and from 8 seconds of play after their last input, the player is away. A
   clear while away still happens and counts toward cells cleared and the level, but it scores
   0 points, does not count as a chain, does not change the combo level or restart its window,
   adds no momentum and earns no clean-sweep bonus. Any input (a rotation, rush on or off,
   pause, or a Panic Clear attempt) ends the away state at once. Starting the run is not an
   input.

## 7. Specials

1. A bomb is a normal coloured piece with a bomb marker. It matches only its own colour. When
   its group clears, it blasts as in section 4.5.
2. A rainbow is a piece that matches any colour (section 4.2). It carries no colour of its own
   for scoring.
3. Specials unlock by skill within a run. Bombs can appear only after the player has reached
   combo level 3 at some point in the current run. Rainbows can appear only after combo level 5. Each spawn has a 3 percent chance to be a bomb (if unlocked) and, otherwise, a 2 percent
   chance to be a rainbow (if unlocked).
4. Unlocks reset with a new run.

## 8. Momentum and Panic Clear

1. Momentum is a meter from 0 to 100, shown to the player. It starts at 0 each run.
2. Each cleared cell adds 1.5 to momentum, and each clear adds the combo level reached by that
   clear. Momentum is capped at 100.
3. At 100, the player can trigger Panic Clear (key, button or tap). It removes every settled cell
   on every side, scores per section 6.6, and resets momentum to 0. It does nothing below 100,
   or when paused or over, or when there are no settled cells. The cells it removes do not
   count toward cells cleared, the level or the arcade kills.
4. Panic Clear does not change the combo level or its window.

## 9. Shrinking boundary and game over

1. Each side has a stack limit in rows. At the start of a run the limit is 12 rows.
2. After the first rotation of the run, a 60 second timer starts. Every 60 seconds of
   unpaused play the limit drops by one row, down to a floor of 4.
3. 10 seconds before each drop, the player sees a warning. The warning and the drop are events
   (section 11).
4. The timer does not run while paused.
5. Game over: after a piece settles and clearing and gravity have finished, if any side has more
   rows than the current limit, the run ends. A drop of the limit that leaves a side above the
   new limit also ends the run, checked the same way.
6. After game over the simulation stops. The final score and the cleared-cell total are
   reported once.

## 10. Level and spawn tuning (new values for this rewrite)

1. Level is `min(35, 1 + 0.06 * cellsCleared + elapsedMs / 45000)`, where elapsed time counts
   unpaused play only. The level is a real number; sections below interpolate by it.
2. Spawn interval eases from 1500 ms at level 1 to 480 ms at level 35.
3. Fall speed rises from 2.6 rows per second at level 1 to 8.5 rows per second at level 35.
4. Combo window shrinks from 2800 ms at level 1 to 1500 ms at level 35.
5. The interpolation is linear in level unless the implementer's tests justify otherwise; the
   endpoints above are fixed.
6. Spawning uses patterns. At each spawn time the engine picks one pattern by weight from those
   whose minimum level is at or below the current level, then emits its pieces over the
   following beats, each beat being one spawn interval:
   - single: one piece in a random lane. Minimum level 1, weight 10.
   - opposite pair: two pieces in opposite lanes on the same beat. Minimum level 3, weight 4.
   - triple fan: three pieces in lanes 0, 2 and 4 or 1, 3 and 5, on the same beat. Minimum
     level 6, weight 3.
   - ring of six: one piece in each lane over one beat. Minimum level 12, weight 1.
   - sweep: one piece per beat in each lane in turn around the hexagon, in a random direction,
     six beats. Minimum level 8, weight 2.
   - zipper: pieces alternate between two opposite sides, six beats. Minimum level 5, weight 3.
7. Piece colours are random, except that no pattern may emit more than two consecutive pieces
   of the same colour.
8. A run opens with the opening (item 9), not with a picked pattern. The director picks its
   first pattern 1000 ms after GO.
9. Opening: within the first second after GO, three pieces of one colour arrive in three
   different lanes. Two come together at GO, in adjacent lanes a and a+1; the third comes
   900 ms later in lane a+3. The colour and lane a are random. Left alone, they settle as a
   pair and a single that does not touch it. One clockwise rotation after the pair settles and
   before the third piece does puts the third beside the pair: a group of three, the run's first
   match. The opening is the only exception to item 7, and the piece after it never has the
   opening's colour.

## 11. Events

The engine emits typed events as it steps. The shell maps them to sound, haptics, text and
React state. At minimum:

- run started, run paused, run resumed, run ended (with score and cells cleared);
- countdown (3, 2 or 1) and go (section 3.7);
- piece spawned, piece settled (side, row, colour, special);
- rotated (direction);
- cells cleared (count, colour, combo level, whether chain);
- bomb detonated (side, row);
- gravity applied;
- combo changed (level) and combo expired;
- clean sweep, panic clear (cells, bonus);
- momentum changed (value);
- level changed (the floor of the level, an integer);
- boundary warning, boundary dropped (new limit);
- score changed.

Events carry plain data and no references to engine internals.

## 12. Determinism and the seed seam

1. The simulation advances in fixed steps of 1000/120 ms. The shell accumulates real time and
   calls the step function, so behaviour does not depend on frame rate.
2. All randomness comes from one seeded generator owned by the engine state. The same seed and
   the same list of timed actions produce the same events and the same final score.
3. The seed is a 32-bit unsigned integer. In production it comes from the browser's secure
   random source. In non-production builds `?seed=<number>` on the page URL overrides it.
4. The painter never mutates simulation state and never draws random numbers from the engine.

## Provenance

This specification was written by the dirty-room spec author for PR T5-3, from the T5-3 plan
text and from observed play of the current game: what the player sees and the scoring rules a
referee would apply. No code, identifier, or constant was copied from the current engine
source, apart from the scoring rules the leaderboard needs (section 6) and the specials
unlock thresholds, both of which are visible in play. All tuning values in section 10 are
the new values from the plan or newly chosen here.

The engine implementer must work from this document and the plan only. The implementer must not
read `hextris.tsx`, `hextris/logic.ts`, `hextris/types.ts`, the upstream Hextris repository, or
any other Hextris source.
