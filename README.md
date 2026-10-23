# T-6551 evidence: Voltorb audio and preload fixes

PR #177 (0aa08470) is live on prod in main f780cdfa (Dokploy job-4182, container booted 2026-10-23 07:55:52Z).

The checks ran in headed stealth Chrome at 1440x900 with no session. */api/arcade/scores* and */api/leaderboard* were blocked through CDP, and nothing was submitted.

after-checks.txt holds both runs.

## First run (autoplay allowed by the profile)
- music_loop.mp3 is fetched about 3.0 s after the intro's "playing" event. Before the fix it was fetched at load.
- There are no audio preload links.
- The intro plays uninterrupted.
- The game_over jingle plays unmuted to the end.

## Autoplay-blocked re-run
Chrome was started with --autoplay-policy=document-user-activation-required, and the page was loaded through a raw CDP Page.navigate, which carries no user gesture.
1. The intro does not play at load. play() is rejected with NotAllowedError, and currentTime stays 0 with no click.
2. After the first real click, the intro plays from 0 with no interruption: currentTime 4.15 then 6.65, with no pause or ended event.
3. music_loop.mp3 is not fetched until about 3.0 s after the intro's "playing" event.
4. game_over plays unmuted at volume 0.5 after a Voltorb hit and ends at 4.06 of 4.1 s.

Console: 0 errors.
after-autoplay-blocked.png shows the board after the first click.
Not exercised: the win jingle, because it needs a cleared level.
