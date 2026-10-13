# Healing Rain branding / audio-first production rollout

Verified at: 2026-10-13T13:52:01.716118+00:00

- Production site: https://melodio.app/healing-rain
- Web release: `c80c46f` (functional implementation `9097d84`, followed by workflow copy alignment).
- Web deployment: https://melodio-7104ygl5z-whaleloops-projects.vercel.app; CLI confirmed production alias.
- Worker release: `9097d84d3d2c68b7d1b1e8accc6d3eb5700aa2ec`.
- Worker: `com.melodio.healing-rain`, Mac mini, pid 57589, running, runs 1, never exited at verification.
- Existing worker configuration preserved at `/Users/muse/melodio-healing-rain/com.melodio.healing-rain.before-9097d84.plist`.

## Database

Applied `20261013_healing_rain_staged_reviews.sql` and
`20261014_create_healing_rain_branding.sql` through the authenticated production SQL editor.
Verified both migrations present, owner RLS forced, browser direct writes and review
RPC execution blocked, server review RPC available, and frozen branding column present.
Before worker rollout: queued 0, running 0; existing ready jobs 2. No existing outputs replaced.

## Verification

- 122 offline tests passed, no skipped tests or paid provider calls.
- Combined PGlite migration/owner isolation/lease CAS/review hashes/global queue cap/rollback regression passed.
- TypeScript and production builds passed. Focused frontend lint passed; renderer lint had
  no errors and one pre-existing unused-disable warning under the command's CJS rule override.
- Actual FFmpeg synthetic general/intro render tests: overlay appears once and is absent
  from all 48 frames after its two-second window. Korean serif/sans differ; markup is escaped.
- Mac mini independent font render and scoped queue/column preflight passed with zero paid calls.
- Production authenticated UI: created disabled `기본 프로필`, selected and deselected it,
  refreshed and verified persistence. No profile currently selected. Preview ON produced one
  title overlay; OFF removed it while retaining draft mode. Test draft discarded after verification.
- Anonymous branding API request returned 401.
- Browser screenshot: `/Users/yoonmanro/.codex/visualizations/2026/10/11/01a12b78-30a5-7091-b99a-22592181d75c/healing-rain-branding-live-20261013.png`.
- Disk after checks: 137 GiB free; Codex session allocated growth approximately 57 MiB.

## Current boundary and next action

Saved channel settings are opt-in and frozen per new job. Missing/disabled settings
produce no overlay. Audio approval is required before paid visuals; preview approval
is recorded without starting long-form output. The live paid adapter supports the
no-thunder sleeper-train recipe, 30-second and three-minute previews. Ten-hour rendering
and the general ten-family intro adapter remain unconnected.

Next: let the user choose channel settings, then start a fresh approved production
through the six-audio review gate. No new media generation was submitted during rollout.
