# T-6535 original Voltorb sprites and HGSS music restored (PR #174), headed desktop proof on prod 2221f243

Headed Chrome on https://amindhou.com/games/super-voltorb-flip, MAIN game (not Daily), sound ON (the mute button reads "Mute"), 2026-10-22 ~18:00Z. A hook recording HTMLMediaElement play/playing/pause/ended events, window errors and console.error was installed before the first navigation. The round was started with a real input click on a tile (the user gesture). No autoplay flag was used.

Audio (1-audio-playing-overlay.jpg, text overlay injected by me with the live values):
- Network: /games/super-voltorb-flip/audio/music_intro.mp3 206, music_level_win.mp3 206, game_over.mp3 206, music_loop.mp3 200.
- After the click, the music_intro.mp3 audio element had paused=false, volume 0.3, muted=false, currentTime 3.85 then 5.86 s about 2 s later (duration 59.6 s), with play and playing events logged.
- Caveat on timing: the music_loop.mp3 warm fetch happened about 3 s after PAGE LOAD (4403 ms), before my click at about 11.8 s, not 3 s after the click. At load all three audio elements also had play() called; the music_level_win and game_over ones were played muted and paused again at the click (an unlock step), which is logged in the hook but is not a bug I can judge.

Sprites:
- 3-burst-attempt.jpg: a mid-burst explosion frame, caught right after flipping the Voltorb tile (best effort, got it).
- 2-round-end-full-viewport.jpg is the settled round-end board; 2-voltorb-tile-zoom.jpg is a crop of the revealed tile, enlarged 2x with nearest-neighbour, showing the original Voltorb creature sprite (a red and white ball with an angry face).
- Round lost on the 3rd flip (Level 1, Voltorb at row 1 col 3), banner "Voltorb! Round lost. Staying on Level 1. No coins this round."

Round-end jingle (4-round-end-banner-jingle-overlay.jpg, injected overlay): game_over.mp3 206; the element logged play/playing at t=33205 ms, then pause/ended at t=37341 ms with currentTime 4.06 of 4.1 s. My polling script missed the playing window, so the screenshot was taken after the jingle had ended; the event log is the proof that it played unmuted at volume 0.5. A win jingle (music_level_win.mp3) was not exercised.

Still the indigo orb in this build: the legend rows, clue cards and memo flags (visible in the screenshots). Amin approved switching them, and that comes in a follow-up PR, not this one.

Console errors across the whole run: 0 (window error, unhandledrejection and console.error all hooked, persisted in sessionStorage; the hook was self-tested earlier in this session with the same code pattern). No score or name submitted, no dialog opened, no POST, Daily untouched. 1-audio-playing-overlay.jpg, 3-burst-attempt.jpg, 4-round-end-banner-jingle-overlay.jpg and 2-* are in this folder; I did not hear the audio (no listener), the proof is the element state and network.
