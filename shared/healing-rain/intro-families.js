'use strict';

// Pure planning data. Compatibility is a recommendation, never an execution gate.
const INTRO_FAMILY_VERSION = 'healing-rain-intro-families-v1';
const COMFORT = 'One adult woman sleeps comfortably, eyes closed, body fully covered by a soft blanket, head on a pillow, in a secure supported bed. Warm, softly luminous low-contrast light; elegant photoreal materials.';
const MOTION = 'Calm 15-second locked shot; tiny blanket breathing only. Keep face, bed and exposure stable. A 9-second soft dissolve at 6-15s is added in editing; do not generate a transition or force cloud occlusion.';
const EXCLUSIONS = ['extra people', 'exposed body', 'unsafe bed or precipice', 'camera motion', 'frantic motion', 'flicker or flashing light', 'forced cloud cover', 'text or logos'];

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const INTRO_FAMILIES = deepFreeze([
  {
    id: 'cloud-bed',
    name: '구름 침대',
    description: '따뜻하게 빛나는 구름 정자에서 편안히 잠드는 침대.',
    worldPrompt: 'A linen bed on a broad solid pavilion above softly luminous ivory cloud banks. A pale warm sky and diffuse golden light make the space bright, peaceful and welcoming.',
    comfortPrompt: COMFORT,
    motionPrompt: `${MOTION} Only extremely slow distant cloud drift.`,
    exclusions: [...EXCLUSIONS, 'floating or swaying bed', 'clouds crossing the sleeper'],
    compatibleScenes: ['train', 'tent', 'mountain-temple', 'highland-village'],
    variants: [
      { id: 'side-canopy', name: '구름 캐노피', compositionPrompt: 'Side bedside view: bed left, a curved canopy overhead, open cloud layers to the right.', atmospherePrompt: 'Softly luminous pearl clouds surround warm, gently glowing linen.' },
      { id: 'recessed-alcove', name: '아늑한 구름방', compositionPrompt: 'Wide diagonal view into a deep cloud-framed alcove; the bed rests behind a broad sill.', atmospherePrompt: 'A pale champagne sky opens beyond bright, softly layered ivory clouds.' },
      { id: 'pavilion-depth', name: '정자 너머 구름', compositionPrompt: 'View from the foot corner across the bed toward two distant pavilion columns and clouds.', atmospherePrompt: 'Cream columns frame spacious warm pearl clouds in soft diffuse light.' },
    ],
  },
  {
    id: 'lotus-bed',
    name: '연꽃 침대',
    description: '고요한 연못 위, 포근한 연꽃잎이 감싸는 안전한 침대.',
    worldPrompt: 'A giant ivory lotus forms a sheltered bed on a fixed dry platform in a still pond. Broad petals surround linen bedding; distant lotus leaves catch soft golden light.',
    comfortPrompt: COMFORT,
    motionPrompt: `${MOTION} A few distant ripples expand slowly; petals and platform stay still.`,
    exclusions: [...EXCLUSIONS, 'wet bedding', 'opening or closing petals'],
    compatibleScenes: ['pond', 'lake', 'hanok', 'mountain-temple'],
    variants: [
      { id: 'petal-nest', name: '꽃잎 둥지', compositionPrompt: 'Three-quarter bedside view with a curved petal behind the pillow and pond to the right.', atmospherePrompt: 'Cream petals, muted jade water, soft warm interior light.' },
      { id: 'pond-gallery', name: '연못 전망', compositionPrompt: 'Wide shore-level view: lotus bed left of centre, a path of small leaves receding behind.', atmospherePrompt: 'Soft pearl reflections spread gently across the welcoming water.' },
      { id: 'petal-arch', name: '꽃잎 아치', compositionPrompt: 'Look past a foreground petal arch toward the bed, with a low open pond horizon beyond.', atmospherePrompt: 'Blush-ivory petals frame softly luminous jade water.' },
    ],
  },
  {
    id: 'underwater-suite',
    name: '수중 스위트',
    description: '따뜻하고 건조한 유리방에서 바라보는 잔잔한 수중 정원.',
    worldPrompt: 'A sealed, dry, warm underwater suite with thick clear curved windows and a solid floor. Outside, a few small fish hover slowly above a sparse aquatic understory.',
    comfortPrompt: COMFORT,
    motionPrompt: `${MOTION} Only two or three distant fish drift slowly; water light stays diffuse.`,
    exclusions: [...EXCLUSIONS, 'water inside the room', 'predators or dense fish schools', 'moving caustics'],
    compatibleScenes: ['pond', 'lake', 'night-nature'],
    variants: [
      { id: 'curved-bay', name: '곡선 유리창', compositionPrompt: 'Bedside profile beside a broad curved glass bay, with aquatic plants low in the distance.', atmospherePrompt: 'Warm luminous linen inside; soft clear teal water beyond thick glass.' },
      { id: 'recessed-suite', name: '포근한 안쪽 방', compositionPrompt: 'Wide diagonal view from a dry alcove across the bed toward two deep window bays.', atmospherePrompt: 'Warm amber wall niches meet a softly luminous blue-green underwater view.' },
      { id: 'garden-window', name: '수중 정원 창', compositionPrompt: 'Bed in the lower left; a tall garden window reveals sparse plants on the distant seabed.', atmospherePrompt: 'A softly lit sand-toned understory leaves ample calm clear water.' },
    ],
  },
  {
    id: 'flower-meadow',
    name: '꽃밭 침대',
    description: '은은한 빛과 꽃향기가 감싸는 아늑한 들꽃 속 잠자리.',
    worldPrompt: 'A low roofed sleeping pavilion on a solid dry terrace in a flowering meadow. Small ivory blossoms and soft grasses surround a protected linen bed in gentle warm light.',
    comfortPrompt: COMFORT,
    motionPrompt: `${MOTION} Only a few distant grass tips stir almost imperceptibly.`,
    exclusions: [...EXCLUSIONS, 'flowers covering the face', 'pollen clouds or busy insects'],
    compatibleScenes: ['tent', 'quiet-park', 'highland-village'],
    variants: [
      { id: 'meadow-edge', name: '꽃밭 가장자리', compositionPrompt: 'Bedside view from the meadow edge, bed left, a low sweep of blossoms extending right.', atmospherePrompt: 'Cream flowers receive a soft, welcoming golden glow.' },
      { id: 'floral-colonnade', name: '꽃기둥 사이', compositionPrompt: 'Look between two vine-covered posts toward the bed and a deep flower-lined path.', atmospherePrompt: 'Warm ivory linen and shaded sage-green foliage.' },
      { id: 'sheltered-cove', name: '포근한 꽃울타리', compositionPrompt: 'Wide diagonal view of the bed in a hedge cove, meadow visible through a broad opening.', atmospherePrompt: 'Soft violet flower accents blend with luminous warm ivory and sage tones.' },
    ],
  },
  {
    id: 'ancient-tree',
    name: '고목 안식처',
    description: '커다란 나무 속, 따뜻한 나뭇결이 감싸는 넉넉한 침실.',
    worldPrompt: 'An ancient living tree holds a spacious dry ground-level sleeping room. Smooth curved wood encloses a secure bed; thick roots frame a quiet forest opening.',
    comfortPrompt: COMFORT,
    motionPrompt: `${MOTION} Only a few faraway leaves move slowly beyond the hollow.`,
    exclusions: [...EXCLUSIONS, 'creeping roots', 'cramped hollow or suspended bed'],
    compatibleScenes: ['cabin', 'night-nature', 'mountain-temple', 'quiet-park'],
    variants: [
      { id: 'root-alcove', name: '뿌리 안쪽 침실', compositionPrompt: 'Bedside view in a broad root alcove; the forest opening sits beyond the foot of the bed.', atmospherePrompt: 'Warm honey wood and quiet moss-green depth.' },
      { id: 'arched-hollow', name: '나무 아치', compositionPrompt: 'View through a wide trunk arch toward the recessed bed, with layered roots at the sides.', atmospherePrompt: 'A shielded amber niche softly lights the rounded interior.' },
      { id: 'forest-threshold', name: '숲을 향한 입구', compositionPrompt: 'Wide diagonal room view: bed deep left, broad doorway right, forest floor receding beyond.', atmospherePrompt: 'Honey-brown grain opens toward softly lit green forest layers.' },
    ],
  },
  {
    id: 'lake-dome',
    name: '호수 돔',
    description: '잔잔한 호숫가 유리 돔 안, 온기로 가득한 편안한 잠자리.',
    worldPrompt: 'A clear glass dome on a broad fixed lakeside platform encloses a dry warm bed. A low still-water horizon surrounds the protected room beneath a softly luminous pearl sky.',
    comfortPrompt: COMFORT,
    motionPrompt: `${MOTION} Tiny distant lake ripples move slowly; the dome and platform stay fixed.`,
    exclusions: [...EXCLUSIONS, 'floating or rocking platform', 'bright sky reflections'],
    compatibleScenes: ['lake', 'pond', 'tent', 'train'],
    variants: [
      { id: 'horizon-bay', name: '호수 수평선', compositionPrompt: 'Side bedside view, bed left and an uninterrupted low lake horizon filling the right bay.', atmospherePrompt: 'Warm golden bedding beside a softly luminous pale-blue lake.' },
      { id: 'curved-roof', name: '둥근 지붕 아래', compositionPrompt: 'Wide interior view from the foot corner with the dome ribs curving above a low bed.', atmospherePrompt: 'Warm ivory ribs frame a calm pearl sky with soft diffuse light.' },
      { id: 'reed-margin', name: '갈대 너머 호수', compositionPrompt: 'Diagonal bed view toward the shore-side window, with a small reed bank beyond the dome.', atmospherePrompt: 'Subdued reeds and distant hills soften the still-water depth.' },
    ],
  },
  {
    id: 'aurora-conservatory',
    name: '오로라 온실',
    description: '따뜻한 온실 침대에서 조용히 펼쳐진 오로라를 바라보는 밤.',
    worldPrompt: 'A warm enclosed conservatory contains a linen bed and sparse winter greenery. Beyond the glass, a very faint aurora hangs above quiet snowy hills.',
    comfortPrompt: COMFORT,
    motionPrompt: `${MOTION} Aurora remains a dim near-still veil with no pulsing or colour cycling.`,
    exclusions: [...EXCLUSIONS, 'bright aurora beams', 'cold or exposed sleeping area'],
    compatibleScenes: ['highland-village', 'cabin', 'lake', 'train'],
    variants: [
      { id: 'glazed-corner', name: '유리창 모퉁이', compositionPrompt: 'Bedside view in a glazed corner, low bed left and the snowy horizon through two windows.', atmospherePrompt: 'Warm ivory interior; a restrained sage aurora far outside.' },
      { id: 'winter-gallery', name: '겨울 정원 회랑', compositionPrompt: 'Wide view along an enclosed garden gallery; the bed occupies a deep planted alcove.', atmospherePrompt: 'Softly luminous amber light warms the room between gentle evergreen silhouettes.' },
      { id: 'rooflight-nook', name: '하늘창 아래', compositionPrompt: 'Diagonal view across the bed beneath a pitched rooflight and a broad low landscape window.', atmospherePrompt: 'A faint muted lilac sky veil stays softer than the bedding light.' },
    ],
  },
  {
    id: 'waterfall-garden',
    name: '폭포 정원',
    description: '잔잔한 폭포를 멀리 두고 쉬는 따뜻한 돌 정자 침실.',
    worldPrompt: 'A dry sheltered bed in a warm stone garden pavilion overlooks a distant narrow waterfall. Broad terraces and lush foliage separate the bed from water and spray.',
    comfortPrompt: COMFORT,
    motionPrompt: `${MOTION} The distant fall flows gently and continuously; no spray reaches the bed.`,
    exclusions: [...EXCLUSIONS, 'raging waterfall or heavy spray', 'bed over a water drop'],
    compatibleScenes: ['night-nature', 'mountain-temple', 'pond', 'cabin'],
    variants: [
      { id: 'terrace-view', name: '테라스 전망', compositionPrompt: 'Bedside view from a covered terrace, bed left and a narrow distant cascade to the right.', atmospherePrompt: 'Warm sandstone light and softly shaded jade foliage.' },
      { id: 'garden-arch', name: '정원 아치', compositionPrompt: 'Look across the recessed bed through a broad stone arch toward layered garden terraces.', atmospherePrompt: 'A slender pearl-silver waterfall glows softly beyond the leaves.' },
      { id: 'fern-courtyard', name: '고사리 안뜰', compositionPrompt: 'Wide diagonal view into a dry fern courtyard; the bed is sheltered behind a solid low wall.', atmospherePrompt: 'Soft amber interior light meets a welcoming jade-green garden.' },
    ],
  },
  {
    id: 'space-garden',
    name: '우주 정원',
    description: '안전하고 따뜻한 우주 정원에서 별을 곁에 두고 쉬는 침대.',
    worldPrompt: 'A sealed warm botanical habitat in space has normal gravity and a solid floor. A secure linen bed rests among sparse plants beside a broad window of dim distant stars.',
    comfortPrompt: COMFORT,
    motionPrompt: `${MOTION} Stars and habitat remain still; no orbital motion or flying particles.`,
    exclusions: [...EXCLUSIONS, 'zero-gravity body or bedding', 'bright planets or star streaks'],
    compatibleScenes: ['train', 'lake', 'highland-village'],
    variants: [
      { id: 'star-window', name: '별빛 창가', compositionPrompt: 'Side bedside view, bed left and a broad deep-space window right behind low leafy planters.', atmospherePrompt: 'Softly luminous warm linen and green leaves beside a sparse quiet night star field.' },
      { id: 'botanical-cove', name: '식물 정원 안쪽', compositionPrompt: 'Wide diagonal view of a sheltered bed cove, with a curved planted walkway and distant glass.', atmospherePrompt: 'Soft amber niches reveal natural wood and quiet plant silhouettes.' },
      { id: 'observatory-arch', name: '별 전망 아치', compositionPrompt: 'View past a broad habitat arch toward the bed and a high window with a low sparse star field.', atmospherePrompt: 'Ivory structural curves and subdued bronze trim enclose the warm room.' },
    ],
  },
  {
    id: 'pearl-shell',
    name: '진주 조개',
    description: '잔잔한 물가에서 은은한 진줏빛 조개가 감싸는 포근한 침대.',
    worldPrompt: 'A giant open pearl shell forms a spacious sheltered bedroom on a stable dry lagoon terrace. A fixed curved shell canopy cradles linen bedding above still water.',
    comfortPrompt: COMFORT,
    motionPrompt: `${MOTION} Only tiny distant lagoon ripples move; shell and pearlescent light stay fixed.`,
    exclusions: [...EXCLUSIONS, 'closing or rocking shell', 'sharp shell edges or wet bedding'],
    compatibleScenes: ['pond', 'lake', 'hanok'],
    variants: [
      { id: 'pearl-alcove', name: '진줏빛 안쪽 방', compositionPrompt: 'Three-quarter bedside view within the shell, curved pearl walls behind the pillow.', atmospherePrompt: 'Soft cream nacre and a restrained blush reflection surround warm linen.' },
      { id: 'lagoon-opening', name: '물가 전망', compositionPrompt: 'Wide view from inside the shell across the bed toward a broad low lagoon opening.', atmospherePrompt: 'Softly luminous opal walls gently frame clear calm teal water.' },
      { id: 'shell-gallery', name: '조개 곡선 회랑', compositionPrompt: 'Diagonal view past a rounded shell rib toward the recessed bed and a side lagoon window.', atmospherePrompt: 'A shielded amber glow reveals satin pearl textures without glitter.' },
    ],
  },
]);

function getIntroFamily(id) {
  const family = typeof id === 'string' && INTRO_FAMILIES.find(item => item.id === id);
  if (!family) {
    const error = new Error('Unknown intro family.');
    error.code = 'episode_invalid';
    throw error;
  }
  return JSON.parse(JSON.stringify(family));
}

module.exports = { INTRO_FAMILY_VERSION, INTRO_FAMILIES, getIntroFamily };
