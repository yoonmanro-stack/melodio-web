# Melodio Channel System v1

Status: Draft for implementation
Version: 1.0
Last updated: 2026-08-15

## 1. Product definition

Melodio is a playlist-channel production studio. Its primary product unit is a
`Channel Project`, not an individual generated song. A Channel Project preserves a
recognizable musical and visual identity over years while producing distinct upload
episodes and tracks inside that identity.

MugSound is a separate application that distributes approved music to physical
spaces according to the emotional state and behavior the space wants to create.
Melodio produces and validates assets; MugSound schedules and plays published
masters.

The shared value chain is:

```text
Listener purpose
-> Channel DNA
-> Upload episode
-> Track blueprint
-> Music, lyrics and visual generation
-> Quality and rights review
-> Creator upload package or MugSound master catalog
```

## 2. System principles

1. Listener intent comes before genre.
2. Channel DNA is durable and versioned; it is never silently rewritten by trends.
3. Variation happens in episodes and tracks, within explicit DNA boundaries.
4. Presets are starting templates, not finished upload titles or song titles.
5. A playlist is planned as a collection before songs are generated.
6. Actual media duration is the source of truth for timelines and duration labels.
7. Generated titles and lyrics require deterministic duplicate validation.
8. Only reviewed masters can enter the shared catalog.
9. Melodio and MugSound share domain assets, but deploy and operate independently.
10. Existing generation flows remain usable during migration.

## 3. Canonical terminology

| Term | Definition | Lifetime |
|---|---|---|
| Concept preset | A reusable template used to start a channel | Product catalog |
| Accent preset | A compatible, limited musical or seasonal variation | One or more episodes |
| Channel Project | The user's long-running playlist-channel workspace | Years |
| Listener Intent | Who listens, why, where, and the desired state change | Channel default, episode override |
| Channel DNA | Locked musical, visual, audience and language identity | Years, versioned |
| Episode | One upload concept, such as a two-hour YouTube video | One upload |
| Track Blueprint | The planned role and constraints of one song | One track |
| Song title | The unique title of an individual track | One track |
| Upload title | The public title of the compiled playlist video | One upload |
| Music master | A finalized audio asset with technical metadata | Permanent |
| Rights Passport | Provenance and permitted-use information for a master | Permanent, append-only audit |
| Visual Bible | Persistent visual identity rules for a channel | Years, versioned |
| Upload Package | Final video, thumbnail, description, timestamps and disclosures | One upload |

Forbidden naming shortcuts:

- `preset.name` must not be treated as an upload title.
- `defaultTitle` must not serve both playlist and song title roles.
- `playlistTitle` must not be used for a Channel Project name.
- “lyrics title” is not a domain term; use `songTitle`.

## 4. Domain hierarchy

```text
Concept Preset
└── Channel Project
    ├── Listener Intent Profile
    ├── Channel DNA Version 1..n
    ├── Visual Bible Version 1..n
    └── Episode 1..n
        ├── Episode listener-intent overrides
        ├── Track Blueprint 1..n
        │   ├── Lyrics
        │   ├── Generation attempts
        │   └── Music Master
        ├── Visual Assets
        └── Upload Package
```

## 5. Listener Intent model

The existing six concepts remain discovery shelves:

- `healing`: 마음의 위로 & 힐링
- `focus`: 몰입 & 생산성
- `retro`: 아날로그 & 향수
- `cafe`: 카페 & 오프라인 공간
- `drive`: 드라이브 & 감성 여행
- `story`: 서사 & 시네마틱 스토리

They are not mutually exclusive production categories. Internally, every channel
and track uses multiple axes.

### 5.1 Required axes

```ts
type AttentionMode = 'background' | 'semi_background' | 'listening' | 'immersive'
type VocalTolerance = 'none' | 'minimal' | 'allowed' | 'preferred'

interface ListenerIntentProfile {
  primaryPurpose:
    | 'recovery'
    | 'focus'
    | 'space_atmosphere'
    | 'movement'
    | 'memory_emotion'
    | 'story_immersion'
  secondaryPurposes: string[]
  listenerPersona: string
  activity: string
  environment: string
  dayparts: string[]
  currentState: string
  desiredState: string
  desiredBehavior: string
  sessionMinutes: number
  attentionMode: AttentionMode
  vocalTolerance: VocalTolerance
  interruptionTolerance: number // 0..100; lower means fewer surprises allowed
  targetEnergy: number // 0..100
  targetEnergyCurve: 'flat' | 'rise' | 'fall' | 'arc' | 'multi_arc'
}
```

### 5.2 Purpose-to-production constraints

| Purpose | Default vocal policy | Variation | Dynamic range | Primary risk |
|---|---|---|---|---|
| Sleep/recovery | None | Very low | Narrow | Sudden accents and false health claims |
| Focus | None or minimal | Low | Narrow | Attention-grabbing solos or breaks |
| Space atmosphere | Venue dependent | Low to medium | Narrow | Conversation masking and volume jumps |
| Movement/travel | Allowed | Medium | Medium | Energy mismatch with journey context |
| Memory/emotion | Allowed | Medium | Medium | Repetitive emotional theme |
| Story immersion | Preferred as configured | High but planned | Wide | Incoherent narrative arc |

Frequency or therapeutic claims such as instant sleep, medical healing, nervous-system
recovery, or guaranteed anxiety removal are marketing claims, not verified production
attributes. The system must not present them as established outcomes without an
approved evidence and policy process.

## 6. Channel DNA

### 6.1 DNA sections

```ts
type LockMode = 'locked' | 'bounded' | 'free'

interface ChannelDna {
  identity: {
    channelName: string
    promise: string
    audience: string[]
    signature: string
  }
  music: {
    primaryGenre: string
    allowedGenres: string[]
    forbiddenGenres: string[]
    bpmRange: [number, number]
    preferredKeys: string[]
    signatureInstruments: string[]
    optionalInstruments: string[]
    forbiddenInstruments: string[]
    vocalPolicy: VocalTolerance
    vocalGenders: string[]
    lyricLanguages: string[]
    era: string
    productionTexture: string[]
    forbiddenProductionTraits: string[]
    baseStylePrompt: string
  }
  visual: {
    world: string
    recurringSubjects: string[]
    locations: string[]
    palette: string[]
    lighting: string[]
    cameraLanguage: string[]
    eras: string[]
    allowedWeather: string[]
    forbiddenElements: string[]
  }
  editorial: {
    titleVoice: string
    descriptionVoice: string
    languages: string[]
    emojiPolicy: 'none' | 'limited' | 'allowed'
    signaturePhrases: string[]
    forbiddenClaims: string[]
  }
  fieldLocks: Record<string, LockMode>
}
```

### 6.2 Mutation rules

- `locked`: generation and optimization cannot alter the field.
- `bounded`: variation must remain inside the stored allow-list or numeric range.
- `free`: episode generation may alter the field.
- Performance data may recommend a DNA change but cannot apply it automatically.
- An accepted DNA change creates a new immutable version.
- Existing episodes retain their original DNA version reference.

## 7. Preset model

### 7.1 Concept presets

A Concept Preset contains:

- default Listener Intent
- Channel DNA template
- Visual Bible template
- compatible Accent Presets
- episode seeds
- title formulas
- track-sequencing policy
- free compact tag prompt
- paid Studio Brief base prompt

### 7.2 Accent presets

Accent Presets may alter only bounded or free fields. Each has:

```ts
interface AccentPreset {
  id: string
  name: string
  compatibleConceptIds: string[]
  conflictingConceptIds: string[]
  maxBlendPercent: number
  mutations: Record<string, unknown>
}
```

Default blend rules:

- Channel Concept: 70–90%
- Combined accents: 10–30%
- More than 30% requires an identity-drift warning.
- More than 50% should offer “Create a new Channel Project”.
- Vocal language, primary audience promise and forbidden elements cannot be blended.

## 8. Episode model

An episode introduces novelty without changing the channel promise.

```ts
interface ChannelEpisode {
  id: string
  channelId: string
  dnaVersionId: string
  episodeTitle: string
  situation: string
  location: string
  daypart: string
  season?: string
  weather?: string
  emotionalArc: string
  listenerIntentOverrides: Partial<ListenerIntentProfile>
  accentPresets: Array<{ presetId: string; blendPercent: number }>
  targetDurationSeconds: number
  plannedTrackCount: number
  vocalTrackPercent: number
}
```

Before approval, an episode must be compared with recent channel episodes for:

- title similarity
- situation and location repetition
- visual-scene similarity
- emotional-arc repetition
- identical Accent Preset combinations

## 9. Track Blueprint

Track planning happens before lyrics or audio generation.

```ts
interface TrackBlueprint {
  trackNumber: number
  songTitle: string
  role:
    | 'opening'
    | 'immersion'
    | 'steady'
    | 'rise'
    | 'peak'
    | 'release'
    | 'reprise'
    | 'closing'
  energy: number
  bpm: number
  musicalKey: string
  leadInstrument: string
  supportInstruments: string[]
  isInstrumental: boolean
  vocalGender?: string
  lyricLanguage?: string
  lyricTheme?: string
  narrativeBeat?: string
  arrangementVariation: string
  targetDurationSeconds: number
}
```

### 9.1 Collection constraints

- Song titles must be unique within the episode and against the channel title ledger.
- Lyrics must be unique per song; repeated full choruses are not allowed.
- The playlist must not place more than three nearly identical energy tracks in a row.
- BPM, key and lead-instrument distributions must satisfy Channel DNA bounds.
- Tracks must follow the episode energy curve.
- Reprises must be labeled and materially rearranged; they are not file duplication.
- Japanese output must pass script/language contamination checks before generation.

### 9.2 Duplicate checks

Validation is applied in this order:

1. Normalize case, whitespace, punctuation and bracketed translations.
2. Reject exact normalized duplicates.
3. Reject string similarity at or above 0.85.
4. Flag semantic similarity at or above 0.90 for targeted regeneration.
5. Compare chorus and opening-line fingerprints across all tracks.
6. Regenerate only the conflicting tracks.

Random seeds are variation inputs, not uniqueness guarantees.

## 10. Studio Brief compiler

The paid prompt is compiled from structured blocks rather than regenerated for every
request.

```text
1. Listener Intent constraints
2. Locked Channel DNA block
3. Episode block
4. Track-specific block
5. Vocal and lyric consistency block
6. Production and mastering block
```

Target character allocation:

| Block | Target size |
|---|---:|
| Channel base | 500–650 |
| Episode | 80–120 |
| Track variation | 150–250 |
| Production suffix and safety margin | Remaining space |

Compiler rules:

- Hard maximum: 1,000 characters.
- Soft target: 900–950 characters.
- Never truncate in the middle of a token or instruction.
- Remove lowest-priority optional blocks before shortening protected fields.
- Genre, vocal policy, instrumental policy and forbidden conflicts are protected.
- Free users receive a compact tag prompt of at most 200 characters.
- Official paid presets use reviewed cached bases.
- Custom paid presets call the optimizer once per input/version and cache the result.
- Cache key includes preset version, Listener Intent version and relevant modifiers.

## 11. Duration and assembly

No upload title or description may claim a duration until media duration is known.

Assembly process:

1. Generate the planned tracks.
2. Probe each audio file for actual duration.
3. Reject corrupt files, long silence and incomplete audio.
4. Sum durations including configured transitions.
5. Compare with the target duration.
6. Fill shortfall using new tracks, approved extended versions or material reprises.
7. Reorder only within allowed energy-curve constraints.
8. Generate timestamps from final media positions.
9. Derive the truthful duration label for the upload title.

Default acceptance window for a two-hour package is 1:58:00–2:03:00.

## 12. Visual system

Album art, thumbnail and video background are separate deliverables derived from the
same episode scene.

Required asset types:

- `album_cover_1_1`
- `youtube_thumbnail_16_9`
- `video_background_16_9`
- `motion_loop_16_9`
- `textless_master`

Visual validation checks:

- Channel palette and world consistency
- Correct era, location and recurring subject
- No forbidden objects or readable generated text
- Safe zones for thumbnail copy
- Sufficient distinction from recent episode visuals
- Asset-specific composition rather than blind cropping

## 13. Upload Package

An Upload Package contains:

- three accurate upload-title candidates
- selected title
- three thumbnail candidates
- curator description
- final ordered song list
- actual timestamps
- actual duration
- relevant hashtags and limited tags
- AI/synthetic-content disclosure checklist
- production and rights references
- final rendered video URL

Title hierarchy is always:

```text
Concept preset name != Channel name != Episode title != Upload title != Song title
```

## 14. Master Catalog and MugSound boundary

Only a `Music Master` that has passed technical, content and rights review can be
published to MugSound.

```text
draft
-> generated
-> audio_qc_passed
-> content_reviewed
-> rights_cleared
-> space_reviewed
-> published
-> retired
```

MugSound reads `published` masters through a catalog contract. It does not read
Melodio generation jobs or draft tracks directly.

### 14.1 Emotion vector

Each reviewed master stores normalized 0–100 scores:

```ts
interface EmotionVector {
  warmth: number
  calmness: number
  brightness: number
  energy: number
  nostalgia: number
  romance: number
  luxury: number
  focus: number
  dreaminess: number
  melancholy: number
  attentionDemand: number
  conversationInterference: number
}
```

Genre remains searchable metadata but is not the primary MugSound navigation.

### 14.2 Rights Passport minimum fields

- composition owner and contributors
- lyrics owner and contributors
- master owner
- generation provider, model/product and generation date
- provider plan or commercial-use basis at generation time
- sample and voice-imitation declarations
- creator-to-platform supply permission
- permitted channels, venues and territories
- contract and policy version
- audit timestamps

Legal approval is required before public-space distribution. Technical ownership flags
must not be presented to customers as legal conclusions.

## 15. Persistence model

Proposed tables:

### 15.1 Melodio-owned

```text
channel_blueprints
channel_dna_versions
listener_intent_profiles
channel_episodes
track_blueprints
generation_attempts
visual_assets
upload_packages
channel_title_ledger
```

### 15.2 Shared catalog

```text
music_masters
music_master_versions
rights_passports
audio_qc_results
content_review_results
emotion_vectors
catalog_collections
catalog_publications
```

### 15.3 MugSound-owned, future app

```text
venues
venue_zones
venue_profiles
playback_devices
programs
schedules
playback_sessions
playback_events
venue_subscriptions
commercial_licenses
```

All user-owned project tables require row-level security. Catalog publishing and rights
state changes require service or curator roles and an audit trail.

## 16. API boundary draft

```text
POST   /api/channels
GET    /api/channels/:id
POST   /api/channels/:id/dna/versions
POST   /api/channels/:id/episodes/plan
POST   /api/episodes/:id/tracks/plan
POST   /api/episodes/:id/validate
POST   /api/tracks/:id/generate
POST   /api/tracks/:id/regenerate
POST   /api/episodes/:id/assemble
POST   /api/episodes/:id/upload-package
POST   /api/masters/:id/review
POST   /api/masters/:id/publish
GET    /api/catalog/masters
```

Batch operations must expose item-level status so failed tracks can be retried without
restarting the entire episode.

## 17. Existing-system compatibility

### 17.1 Current types

- Existing `Preset` remains valid during v1 migration.
- Existing `PlaylistTrack.title` maps to `TrackBlueprint.songTitle`.
- Existing `PlaylistGeneratorResult.playlistTitle` maps to
  `UploadPackage.youtubeUploadTitle`, never to a channel name.
- Existing `PromptPayload` remains the engine-facing payload.

### 17.2 Current prompt metadata

Fallback precedence during migration:

```text
channel DNA compiled prompt
-> metadata.studio_grade_prompt for paid users
-> preset.customPrompt
-> composed selections
-> metadata.suno_tags
-> preset description/name fallback
```

### 17.3 Existing generations

Existing `generations` rows remain valid. New masters may reference a generation row
instead of migrating all historic rows immediately. Existing audio quality columns and
cover-art URLs are reused where possible.

### 17.4 Current six categories

The public catalog continues to show the six categories. New Listener Intent axes are
introduced behind them first, then exposed through Channel Builder onboarding.

## 18. Migration sequence

### Milestone 1 — Domain foundation

- Add typed domain interfaces without changing UI behavior.
- Add Channel Project, DNA, Listener Intent, Episode and Track Blueprint tables.
- Add adapters for existing Presets and PlaylistTracks.

### Milestone 2 — Planning before generation

- Add Channel Builder onboarding.
- Add Episode Planner.
- Generate and approve a full track blueprint before lyrics/audio calls.
- Add deterministic title and lyrics duplicate checks.

### Milestone 3 — Compiled production

- Replace ad hoc randomization with bounded DNA-aware variation.
- Introduce the structured Studio Brief compiler.
- Add targeted track regeneration.
- Assemble using actual audio durations.

### Milestone 4 — Visual and upload package

- Add Visual Bible and derivative asset types.
- Generate actual timestamps and truthful duration labels.
- Produce upload titles, descriptions, thumbnails and disclosure checklist.

### Milestone 5 — Shared catalog

- Add Music Master, Rights Passport and review workflow.
- Add emotion vectors and space-suitability review.
- Publish a read-only catalog contract for MugSound.

### Milestone 6 — MugSound application

- Create an independent app in the same repository.
- Add venue emotional profiles and daypart programming.
- Add a separate resilient player after catalog and scheduling stabilize.

## 19. Product success measures

Melodio:

- Time from episode selection to approved plan
- Percentage of official preset applications avoiding optimizer calls
- Track-level regeneration rate
- Duplicate-title and duplicate-lyrics escape rate
- Actual duration accuracy
- Channel DNA consistency and episode distinctiveness
- User edits required before upload

MugSound:

- Manual skips and blocked tracks
- Unexpected volume adjustments
- Playback completion and interruption rate
- Venue/daypart match score
- Catalog repetition fatigue
- Device uptime and offline continuity

Metrics may tune bounded variables, but never silently mutate locked Channel DNA.

## 20. YouTube Autopilot integration

Autopilot is a downstream operator of the Channel System, not a second source of
channel identity. The rollout remains backward compatible:

- Automations without `channel_blueprint_id` continue using the existing
  `audio_preset_id` flow.
- A linked automation creates a new Episode from the latest approved immutable DNA
  version and its saved Listener Intent; it never edits Channel DNA during a run.
- `channel_episode_strategy.enabled` is an explicit switch. A missing or disabled
  strategy falls back to the legacy preset flow.
- Each run plans distinct episode and track titles against recent history before any
  paid generation begins.
- Plan and sample approval gates remain enabled by default. Fully unattended
  publishing is a later policy choice, not an implied consequence of linking a
  channel.
- Existing service-role Autopilot APIs must verify that the authenticated user owns
  the referenced `channel_blueprint_id`, because service-role queries bypass RLS.

This keeps Autopilot focused on efficient recurring production while Channel Builder
remains the only place where long-lived concept DNA is deliberately revised.

### Channel Builder server boundary

The browser can use Route Handlers, while server-rendered forms can call equivalent
Server Actions. Both paths share the same runtime parser, lock validator and
request-scoped Supabase service:

| Operation | Route Handler | Server Action |
| --- | --- | --- |
| Create channel + DNA v1 + intent | `POST /api/channel-builder` | `saveChannelDraftAction` |
| Create immutable DNA version | `POST /api/channel-builder/:channelId/dna` | `createDnaVersionAction` |
| Update listener intent | `PATCH /api/channel-builder/:channelId/listener-intents/:profileId` | `updateListenerIntentAction` |

Successful routes return `{ success: true, data }`. Failures expose a stable error
code (`AUTH_REQUIRED`, `INVALID_INPUT`, `DNA_LOCK_VIOLATION`, or
`PERSISTENCE_ERROR`) plus field or lock issues where applicable. The create route
expects a complete `LegacyPresetChannelDraft`; the listener update body contains the
editable intent fields without IDs or timestamps.

### First Episode Blueprint flow

After Channel DNA v1 is saved, Channel Builder links directly to the first Episode
planner. The planner loads the latest immutable DNA and Listener Intent in parallel,
then lets the operator define only episode-level variation:

1. Scene: upload title, situation, location, daypart, season, weather and emotional
   transition.
2. Format: 90/120/180 minutes, 2/10/20/30/40 final tracks, vocal ratio and
   energy curve.
3. Track Blueprint: unique song title, functional role, energy, BPM and lead
   instrument for every track.
4. Save: validate sequential track numbers, exact duration sum and title uniqueness
   against the latest 12 episodes, then persist the Episode and all tracks in one
   transaction.

Saving a blueprint does not start paid music generation. The Episode becomes
`planned` and its tracks remain `draft` until a later approval gate.

### Suno pair semantics

One Track Blueprint represents one intended final song with one unique title and,
when vocal, one unique lyric. Suno returns two A/B candidates from the same lyric for
each generation request. Those candidates are alternatives, not two playlist slots:

```text
20 Track Blueprints -> 40 raw Suno candidates -> 20 selected Masters
```

The Review screen therefore shows both the final-master target and the doubled raw
candidate count. Title and lyric uniqueness apply between Blueprints; A/B candidates
inside one Blueprint deliberately share their title and lyric. Approval locks creative
Track fields while still allowing later production status transitions.

### Episode Review quality gate

The Review surface loads the saved Episode and ordered Track Blueprints, displays the
final-master count beside the doubled Suno A/B candidate forecast, and supports:

- individual title, role, energy, BPM, key, lead instrument, vocal mode and
  arrangement-variation edits;
- deterministic title regeneration using Episode scene and Track role, without an AI
  call or token cost;
- filters for instrumental, vocal and title-conflict tracks;
- approval only after all local edits are saved and no track mutation is running.

The approval RPC rechecks ownership, planned track count, exact total duration and
approvable statuses in one transaction. Application validation additionally enforces
the Channel DNA BPM range, vocal policy and recent-title ledger. Approved creative
fields are protected by a database trigger against direct-client bypass updates.

### Generation Queue

승인된 Episode은 `Blueprint → 생성 패키지 → Suno A/B 후보 → Master 선택` 순서로 처리한다.

- Track Blueprint 한 개는 최종 Master 한 곡을 뜻한다.
- Suno는 같은 제목과 가사로 A/B 후보 두 곡을 생성한다. 따라서 20개 Blueprint는 후보 40곡을 만들고 최종 20곡을 선택한다.
- Queue 준비 시 모든 곡의 스타일 프롬프트를 먼저 컴파일한다. 무료 플랜은 200자 이내 Compact 태그 프롬프트, 유료 플랜은 1,000자 이내 Studio-Grade 자연어 브리프를 사용한다.
- Instrumental은 프롬프트 준비 즉시 `ready`가 된다. Vocal은 승인된 곡 제목을 유지하면서 곡마다 고유한 가사를 별도 컴파일한다.
- Vocal 가사 작업은 최대 3개씩 독립 실행한다. 한 곡이 실패해도 성공한 곡을 보존하고 해당 곡만 재시도한다.
- 동일 Episode 안에서 가사 본문의 정규화 SHA-256을 비교해 완전 중복을 차단한다.
- Generation Queue 단계는 Suno에 생성 요청을 보내지 않는다. 따라서 Suno 생성 크레딧은 후속 제출 단계 전까지 사용되지 않는다.

### Generation Console과 Master 선택

- 사용자는 곡별 제출 또는 전체 순차 제출을 선택한다. 전체 제출은 예상 작업 수와 유료 크레딧 사용 확인을 요구한다.
- 서버는 Queue Item을 `ready → submitting`으로 조건부 선점한다. 더블클릭과 중복 요청은 같은 Blueprint를 다시 제출하지 못한다.
- Suno 작업이 접수되면 기존 `generations` 파이프라인과 Mac mini worker가 A/B 후보를 생성하고 음질을 검사한다.
- Worker가 추천한 우승 후보는 Candidate A로 표시하지만 자동 Master 확정은 하지 않는다. Candidate B와 직접 청취·비교한 뒤 사용자가 최종 Master를 선택한다.
- A/B 후보는 `generation_queue_candidates`에 명시적으로 연결되며 길이, 오디오 등급, clipping, dissonance 지표를 보존한다.
- Dashboard에서는 소유자에게 A/B 두 곡을 모두 보여준다. 공개 플레이리스트에는 사용자가 Master로 선택한 한 곡만 노출하고 나머지 후보는 비공개로 유지한다. Master를 변경하면 두 후보의 공개 상태도 함께 뒤집는다.
- 모든 Track의 Master가 선택되면 Generation Batch가 `completed`가 되고 후속 편성·영상·업로드 패키지 제작으로 넘어간다.

### Episode Assembly

- 확정 Master는 Track Blueprint 번호 순서대로 조립하며 v1 Assembly Mode는 `gapless`로 고정한다. 크로스페이드와 임의 무음을 넣지 않아 타임스탬프를 정확히 유지한다.
- Assembly Plan은 선택된 Candidate의 실제 길이를 누적해 각 곡의 `start_seconds`, `end_seconds`와 YouTube Tracklist를 생성한다.
- 1시간 미만은 `M:SS`, 1시간 이상은 `H:MM:SS` 형식을 사용한다.
- Worker는 실행 시 모든 Master 원본을 다시 내려받고 `ffprobe`로 재측정한다. DB의 예상 길이와 다르면 Assembly Item과 Tracklist를 실측값으로 보정한다.
- FFmpeg concat은 전체를 320kbps MP3로 다시 인코딩해 입력 파일 간 코덱 파라미터 차이를 흡수한다.
- 완성 파일은 `melodio-assets/channel-episodes/{userId}/{episodeId}/{assemblyId}.mp3`에 저장하며 Episode 상태를 `completed`로 전환한다.
- UI는 목표 길이와 실측 길이 차이, 곡별 시작·종료 시각, Tracklist 복사, 완성 Episode 재생·다운로드를 제공한다.
- 일반 Channel Episode에는 아직 영상 생성 단계를 연결하지 않는다. 현재 30초 영상 생성은 Viral & Trend Zone 전용이며 Audio Forge Pro, Preset Studio, 일본 BGM의 일반 음원과 Episode Assembly에는 적용하지 않는다.

### Staging deployment gate

`npm run gate:staging`은 기본적으로 읽기 전용이며 환경 변수, Channel System 스키마, Storage 버킷, 기존 완성 음원 2개, A/B 공개 Master 불변식, Worker의 `ffmpeg`·`ffprobe` PATH를 검사한다.

- `--assembly-smoke`: 기존 완성 음원 2개를 로컬 임시공간에서만 320kbps MP3로 병합하고 원본 누적 길이와 결과 길이 오차를 검사한다. 사용자 음원은 업로드하지 않는다.
- `--write-probe`: 합성 1초 무음 MP3만 Storage에 업로드하고 Range 읽기와 삭제를 확인한다.
- blocking 실패가 하나라도 있으면 배포를 중단한다. 권장 순서는 `staging DB migration → web → worker → 2-track E2E → production DB → web → worker`다.

### Episode Publish Package와 스틸 커버

- 완료된 Assembly에서 실제 MP3 URL과 Tracklist를 고정하고 Channel DNA의 Editorial 규칙으로 업로드 제목·설명·검색 태그·해시태그를 컴파일한다.
- Visual DNA와 Episode 장면·계절·날씨·감정 곡선으로 1:1 스틸 커버 프롬프트를 만든다. 출력은 1024px PNG이며 글자·로고·워터마크를 금지한다.
- 커버는 한 장씩 명시적으로 생성한다. 생성 버튼을 누를 때만 이미지 비용이 발생하며 여러 후보 중 하나를 Publish Cover로 선택한다.
- Package는 Episode MP3, Cover PNG, Metadata JSON을 개별 다운로드하고 YouTube 설명을 복사할 수 있다.
- 일반 Episode Publish Package의 `video` 값은 `null`이다. 30초 영상 파이프라인은 Viral & Trend Zone에만 존재한다.

## 21. v1 acceptance criteria

The first creator-facing release is complete when a user can:

1. Create a Channel Project from an existing preset.
2. Define and save a Listener Intent Profile.
3. Lock Channel DNA fields and create a versioned update.
4. Generate a distinct episode using that DNA.
5. Review a planned collection with unique song titles before generation.
6. Generate unique lyrics per vocal track and target-regenerate conflicts.
7. Compile free and paid prompts according to entitlement.
8. Assemble media using actual durations and generate accurate timestamps.
9. Receive an Upload Package whose naming levels are not conflated.
10. Preserve compatibility with the current Preset Studio, Audio Forge Pro and Japan
    BGM flows during rollout.

MugSound development begins after the shared Master Catalog contract, review states,
emotion vector and Rights Passport are stable enough to consume without reaching into
Melodio internals.

## 22. Explicit non-goals for the first implementation

- Moving the existing application into a monorepo immediately
- Building the MugSound playback client before catalog contracts exist
- Automatically changing Channel DNA from analytics
- Claiming medical, therapeutic or guaranteed productivity outcomes
- Treating generated rights metadata as legal clearance without review
- Generating a full two-hour video before actual audio duration is known
- Migrating every historic generation before new projects can ship

## 23. Immediate implementation backlog

1. Add domain TypeScript types for Channel DNA, Listener Intent, Episode and Track
   Blueprint.
2. Draft additive Supabase migrations for the first four domain tables.
3. Implement adapters from existing `Preset` and `PlaylistTrack` structures.
4. Add pure validation functions for lock bounds and title uniqueness.
5. Add tests for normalization, duplicate rejection and prompt block prioritization.
6. Prototype Channel Builder onboarding behind a feature flag.
