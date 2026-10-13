# Healing Rain local preview assembler

Requires Node 22+, FFmpeg with libx264, and ffprobe on PATH. This module only reads
local media; it does not generate media, upload files, or call a provider.

```sh
node worker/healing-rain-render.js \
  --video /absolute/sleepertrain11sec.mp4 \
  --audio /absolute/rain-01.wav --audio /absolute/rain-02.wav \
  --audio /absolute/rain-03.wav --audio /absolute/rain-04.wav \
  --audio /absolute/rain-05.wav --audio /absolute/rain-06.wav \
  --output-dir /absolute/new-preview-directory --seconds 180 --preview-seconds 30 \
  --video-cycle 10
```

The output directory must not exist, and its parent must exist. Every subprocess
uses an argument array without a shell; input paths never enter filter syntax or
concat manifests. Input protocol allowlists prevent local manifests from fetching
nested network resources. Existing output directories and files are never overwritten.
At least 10 GiB plus an estimated render allowance must be free before work starts.
On failure, a bounded `render-failure.json` records the durable state; partial
artifacts remain for inspection. No user files or session recordings are removed.

Worker integration:

```js
const { renderHealingRain } = require('./healing-rain-render');
const report = await renderHealingRain({
  video: absoluteVideoPath,
  audio: absoluteTakePaths,
  outputDir: newAbsoluteOutputDirectory,
  seconds: 180,
  previewSeconds: 30,
  videoCrossfadeSeconds: 1,
  targetVideoCycleSeconds: 10,
  audioCrossfadeSeconds: 2,
  fps: 24,
  maxWidth: 1920,
  onProgress: stage => console.log(stage),
});
```

`videoPath`, `audioPaths`, and `targetSeconds` are accepted aliases. CLI options
are shown by `--help`. Inputs allow 1–32 audio takes (each no longer than 120s),
one video no longer than 60s, and outputs up to 600s. Crossfades must be shorter
than half the relevant source duration. Output lengths must align to video frames.

## Forward video cycle

With `targetVideoCycleSeconds: 10` (CLI `--video-cycle 10`), the renderer counts
decoded frames at the output frame rate and uses exactly 264 frames at 24fps:
240 frames for the cycle plus 24 frames for the 1s overlap. A provider source
containing 265 frames (11.041667s) loses its one excess tail frame instead of
producing a 241-frame loop. Source metadata duration does not define the cycle.
An insufficient decoded source fails before audio assembly; the renderer never
slows it or pads it to meet a requested cycle. Source/used/trimmed frame counts
are recorded in the report.

At 24fps, the trimmed 11s source with a 1s overlap becomes one exact 10s cycle.
The cycle starts at source t=1s, plays forward, and dissolves its last second into
source t=0–1s. The next repetition resumes at t=1s. If no target cycle is supplied,
a 10s source instead produces a 9s cycle; the report records the actual
`effectiveVideoCycleSeconds` after frame quantization. No reverse, ping-pong, speed change, or optical-flow interpolation
is applied. A dissolve can show two forward-moving scenery positions at once;
review that visual effect and confirm the original source's direction.

One H.264 cycle is encoded with a closed GOP and no B frames, using CRF 23,
a 1.6 Mbps maximum rate, a 3.2 Mbps VBV buffer, and a half-full initial buffer.
These preview settings reserve room for 192 kbps AAC below a 45 MiB upload
budget for the 180s sample. The renderer measures each final MP4's actual byte
count and fails if it reaches 45 MiB, rather than returning an oversized file for
upload. The report includes the encoding settings, byte counts, and size checks.
Very long or unusually complex arbitrary outputs may still hit this guard.

Each final MP4
repeats this cycle using stream copy, so the 3-minute image sequence is not
re-encoded. For 11s inputs, both 30s and 180s consist of whole 10s cycles. If an
arbitrary target does not divide the cycle evenly, internal joins stay continuous
but the video endpoint may not match its beginning; the report flags this using
`videoEndpointClosesCycle`.

## Continuous audio

Each take is first measured with FFmpeg's EBU R128 analyzer, then receives one
fixed gain aiming for -26 LUFS, capped at -6 dBTP and at most 36 dB of boost.
The renderer applies only static gain; it does not compress or limit a take's
internal dynamics, so it cannot create compressor pumping. It reports the
measured input loudness/true peak, applied gain, and predicted resulting values.
If headroom or the gain cap prevents matching, the report warns instead of
silently asserting matched loudness. Near-silent or very short takes that cannot
be measured reliably fail before assembly. Final playback loudness still depends
on the listener's volume setting.

Each matched take is decoded to 48kHz stereo 24-bit PCM; this removes MP3/AAC framing
from all joins. Takes keep their supplied order and use equal-power (`qsin`)
overlaps without pitch changes. Overlaps shorten the material: six 30s takes with
2s crossfades yield 170s, so the assembler repeats the first take for extra material.
It reserves another 2s for a tail-to-head crossfade. Every output gets its own
circular PCM timeline and a further fixed -3.1dB gain for crossfade headroom
(approximately -29 LUFS for steady matched rain). No silence
is appended to meet a requested duration. The final AAC track is encoded once
from its complete WAV, preventing encoder padding at each internal take boundary.

Equal-power overlaps can still change perceived loudness, and a source with
unusual clipping or embedded silence needs separate source review. The full WAV
and decoded AAC are independently measured for integrated loudness, loudness
range and true peak; outputs exceeding -1 dBTP fail instead of clipping silently.
AAC encoder
priming and up to one trailing AAC frame are measured separately from actual
packet gaps; MP4 edit timing controls presentation duration.

## Artifacts and verification

- `healing-rain-30s.mp4` and `healing-rain-180s.mp4` (or requested durations).
- `audio-continuous-30s.wav` and `audio-continuous-180s.wav` with exact PCM lengths.
- `video-loop.mp4`, decoded `pcm-take-NN.wav` files, and `render-report.json`.

The report measures actual durations, PCM sample counts, 100ms near-silent
windows, PCM/AAC sample peaks, audio endpoint sample discontinuity, monotonic
packet timestamps and packet gaps. A small grayscale decode measures the video
wrap's mean absolute frame difference against interior median/p95 differences.
These are objective continuity checks, not a claim of perceptually invisible
seams. Audio silence and unusual visual differences produce review warnings;
wrong durations or packet timestamp gaps fail the render.

```sh
node --test scripts/healing-rain-render.test.cjs
```

The basic integration test renders only four seconds of small synthetic media, checks
both WAV and MP4 continuity, verifies original input hashes and overwrite
rejection, and retains a few MB of diagnostics under `/private/tmp`.
Its padded source has one extra decoded frame; the requested cycle trims it and
keeps every repeated frame in forward order. A separate frame-plan regression
covers the actual 265-frame provider case and the 30s/180s endpoints, including
rejection of sources too short for an exact 10s cycle.
Another six-second fixture covers over 40 LU of input-level variation, verifies
stable output levels and headroom, and checks normalized samples against the
originals multiplied by a constant gain to detect unwanted dynamic processing.

## Generation worker and rollout

`healing-rain-worker.js` consumes the private database queue created by
`20261012_create_healing_rain_generations.sql`. It uses the saved project snapshot,
never browser-supplied prompts. The first version supports the sleeper train with
six audio takes and no thunder. The website needs `HEALING_RAIN_GENERATION_ENABLED=true`
and the owner's UUID in `HEALING_RAIN_ALLOWED_USER_IDS` before it accepts new jobs.
Reading existing jobs remains available when creation is disabled.

Keep a private mode-0600 environment file outside the checkout containing
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KIE_API_KEY`,
`ELEVENLABS_API_KEY`, and an absolute `HEALING_RAIN_OUTPUT_ROOT`. Put FFmpeg and
ffprobe on PATH. Run with Node 22 or newer:

```sh
node --env-file=/absolute/private-worker.env worker/healing-rain-worker.js
```

Append `--once` to process at most one claim. Deploy the exact tested Git commit
into an isolated checkout; do not reset an existing dirty worker or restart other
services. A 180-second claim lease is renewed every 30 seconds. Expired running
jobs retain their checkpoints. Known submitted video tasks are polled again;
paid requests with uncertain outcomes are held for operator inspection.

Every paid call first saves an intent. An explicit provider failure is also held,
including zero-credit failures. There is no automatic paid retry. Before an
operator-authorized retry, verify provider task state and actual usage, preserve
the previous task checkpoint and receipt, then requeue only the failed stage.
Never erase an ambiguous intent or assume a failed HTTP response was free.

The job becomes `ready` only after both preview files are uploaded privately.
This status means rendering completed, with visual/audio loop review still pending.
Ten-hour output is not part of this preview worker. Review the passing scenery,
window-rain movement, fixed cabin geometry, every audio join and the 180-to-0-second
boundary before promoting a sample to a long-form production workflow.


## Versioned direction and checkpoint provenance

Plans retain their outer schema/recipe version 1. New plans carry
`direction.version = healing-rain-direction-v2`; the shared direction compiler
supplies the same image and video prompts shown in the UI and used by the worker.
The worker verifies both stored prompts against that compiler before any provider
call. The plan records the 10-second output cycle, 11-second source and 1-second
overlap separately. The source filename, upload duration and rendering parameters
come from the compiled spec. No hidden worker prompt suffix or job-ID variation is
added to v2. The train/six-take/no-thunder generation gate remains in place while
other scene families await media review.

`healing-rain-plan-v1.js` preserves the original worker generation spec, including
its static blanket instruction and job-ID image variation, for plans without a
direction field. Reading or resuming a legacy plan does not migrate its prompts.
Unknown direction versions are rejected. Do not edit the legacy compiler to change
new outputs; derive a new direction version instead.

Before the first paid intent, the worker exclusively creates and syncs
`generation-spec.json`, then records its canonical SHA-256 and version in the
private database checkpoint. Every new stage receipt includes that fingerprint.
A restart compares the proposed spec with the file and database fingerprints,
stage model/version provenance and saved source duration before polling,
downloading or submitting anything. Mismatches preserve the previous receipt and
hold the job for operator review. V2 resumed assets without provenance are held;
historical v1 jobs can adopt the exact legacy spec when an older receipt is absent.
A failed or uncertain checkpoint never automatically produces another paid call.

V2 `review.json` and the render checkpoint include the rule version and the shared
quality summary, evaluated from the actual render report. Existing technical
checks remain in force; unmeasured regional brightness, camera movement, train
direction/speed and anatomy are marked for review, not asserted as passed. A
ready job still has pending media review. No ten-hour output or new scene-family
production approval is implied by this technical summary.


An optional `HEALING_RAIN_REVIEW_REGISTRY` points to an absolute mode-0600 JSON
file outside the checkout. It contains `{ "version": 1, "records": [...] }` and
at most 500 records / 64 KiB. Each approved record must include `profile`,
`directionVersion`, `verdict: "approved"`, `reviewedAt`, `evidenceId`, and exact
`models.image`, `models.video`, `models.audio` identifiers. The registry is an
operator-managed source of completed media reviews, never browser input. Invalid,
missing configured, oversized or public-readable registries hold a job before any
provider call. Without a configured registry, all new rule/model profiles require
review. Matching reviews reduce routing to technical exceptions and deterministic
10-percent samples; they do not change the worker's pending review status or
expand the generation gate.
