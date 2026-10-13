'use strict';

// Browser and worker share this data-only compiler. No provider, I/O or clock dependencies.
const DIRECTION_VERSION = 'healing-rain-direction-v2';
const SCENE_IDS = ['train', 'tent', 'hanok', 'cabin', 'night-nature', 'quiet-park', 'mountain-temple', 'pond', 'lake', 'highland-village'];
const INTENSITIES = {
  gentle: { en: 'Sparse gentle rain with distinct soft droplets.', ko: '성긴 잔잔한 비' },
  moderate: { en: 'Moderate steady rain with rounded droplets.', ko: '고르게 내리는 보통 비' },
  heavy: { en: 'Heavy sustained rain with frequent impacts.', ko: '굵고 지속적인 비' },
  downpour: { en: 'Dense downpour with energetic irregular splashes.', ko: '촘촘한 폭우와 불규칙한 물튀김' },
};
const SCENES = {
  train: {
    family: 'sleeping-shelter', name: '침대 열차',
    scene: 'Private sleeper train compartment well after bedtime, overhead lights switched off. A large rain-streaked side window overlooks anonymous dark forest and a few faint distant rural lights. The bed and warm shielded nightlight occupy the left third; the side window fills most of the right two thirds. Original compartment, no recognizable route or landmark.',
    architecture: ['rigid window frame', 'bed', 'furniture', 'carriage geometry'], landscape: [],
    profiles: ['sleeping-adult', 'glass-rain', 'split-lighting', 'constant-train-travel'],
    camera: { wide: 'Wide oblique bedside view; window dominates, bed anchors the lower foreground.', window: 'Large side window dominates; retain the sleeping woman and bedding at the left edge.', bedside: 'Low bedside view diagonally past bedding toward the large side window; natural sleeping side profile, no face close-up.' },
    details: ['folded olive blanket and asymmetrical wooden shelf', 'rust-colored cushion and shielded rounded nightlight', 'slate blanket and simple woven storage basket', 'cream throw and small shielded ceramic nightlight'],
    exclusions: ['stations', 'tunnels', 'approaching headlights', 'identifiable landmarks', 'steam'],
    motionKo: '가까운 수풀은 화면 너비를 약 1–2초에 지나가는 초기 목표로, 먼 풍경은 더 천천히 오른쪽에서 왼쪽으로 정속 이동합니다. 감속·정차·역방향 없이 이어갑니다.',
  },
  tent: {
    family: 'sleeping-shelter', name: '숲속 텐트',
    scene: 'Inside a dry forest tent at deep night. A sheltered open vestibule frames the rainy forest. A sleeping bag and a small shielded warm lantern make a readable resting area; rain remains outside the dry inner tent.',
    architecture: ['tent poles', 'tent seams', 'sleeping bag', 'dry inner floor'], landscape: ['tree trunks'],
    profiles: ['sleeping-adult', 'flexible-shelter', 'dry-interior', 'split-lighting'],
    details: ['olive sleeping bag and folded dry groundsheet', 'rust pillow and shielded lantern', 'slate sleeping bag and woven gear basket', 'cream liner and compact shielded lantern'],
    exclusions: ['rain entering the sleeping area', 'collapsing tent'],
    motionKo: '빗방울과 입구의 낙수, 천막의 아주 작은 떨림만 이어집니다. 텐트 지지대와 실내 건조 영역은 유지합니다.',
  },
  hanok: {
    family: 'architecture', name: '한옥 처마',
    scene: 'Warm Korean hanok room facing an empty wet courtyard beneath tiled eaves at deep night. Readable wooden pillars and warm sheltered room contrast with the dark courtyard. Original setting.',
    architecture: ['tiled roof', 'wooden pillars', 'room', 'courtyard edges'], landscape: ['courtyard trees'],
    profiles: ['fixed-architecture', 'natural-eave-runoff', 'split-lighting'],
    details: ['wooden window frame and a shallow courtyard puddle', 'curved tiled eaves above wet stepping stones', 'warm paper doorway beside a dark garden corner', 'weathered porch boards facing clay tiles'],
    exclusions: ['frozen icicle-like runoff'],
    motionKo: '기와와 목재는 고정하고 처마의 물이 불규칙하게 끊어지는 낙수와 마당의 작은 물튀김만 이어집니다.',
  },
  cabin: {
    family: 'sleeping-shelter', name: '숲속 오두막',
    scene: 'Cozy woodland cabin bedroom at deep night, a rain-streaked window facing dark trees and a small shielded warm bedside lamp. Warm readable face and bedding, gently brighter interior against a much darker exterior, without twilight or blue evening afterglow.',
    architecture: ['window frame', 'bed', 'wooden walls', 'furniture'], landscape: ['distant tree trunks'],
    profiles: ['sleeping-adult', 'glass-rain', 'split-lighting'],
    details: ['olive blanket and asymmetrical wooden shelf', 'rust cushion and shielded rounded bedside lamp', 'slate blanket and woven storage basket', 'cream throw and small shielded ceramic lamp'],
    exclusions: ['blue evening afterglow'],
    motionKo: '유리창 빗물이 천천히 합쳐져 흘러내리고 숲의 잎만 미세하게 움직입니다. 방과 창틀은 고정합니다.',
  },
  'night-nature': {
    family: 'natural-water', name: '깊은 밤의 자연',
    scene: 'Remote moss-covered canyon at deep rainy night, fern-lined rock walls, a quiet stream and untouched lush forest. Static sheltered viewpoint with reassuring calm. Very low-key exposure; faint diffuse night light reveals wet rock edges, without a bright sky. Original natural setting, not a location recording.',
    architecture: [], landscape: ['mossy rocks', 'canyon walls', 'tree trunks', 'stream banks'],
    profiles: ['fixed-landscape', 'subtle-vegetation', 'slow-stream'],
    details: ['layered moss walls and narrow stream bend', 'fern-framed rock ledges beside a quiet stream pool', 'dense forest canopy over smooth wet stones', 'secluded gorge opening and small rippling water'],
    exclusions: ['buildings', 'traffic', 'waterfall', 'dramatic spotlight'],
    motionKo: '바위와 나무줄기는 고정하고 비, 작은 잔물결, 느린 계류와 잎의 미세한 움직임만 허용합니다. 계류는 별도 검수 대상입니다.',
  },
  'quiet-park': {
    family: 'architecture', name: '한적한 공원',
    scene: 'Secluded wooded park at deep rainy night, empty wet stone path and a simple empty bench among dense trees. Dim shielded warm path lamps, restrained reflections and deep shadows. Peaceful original setting without city skyline.',
    architecture: ['bench', 'path lamps', 'stone path'], landscape: ['tree trunks', 'ground contours'],
    profiles: ['fixed-structures', 'subtle-vegetation', 'wet-ground'],
    details: ['curved stone path and one empty bench', 'small stone stairway beneath mature trees', 'narrow path beside a shallow puddle', 'quiet grove with low shielded path lights'],
    exclusions: ['traffic', 'neon', 'city skyline'],
    motionKo: '나무줄기와 벤치는 고정하고 비, 잎의 미세한 움직임, 젖은 바닥의 작은 잔물결만 이어집니다.',
  },
  'mountain-temple': {
    family: 'architecture', name: '고요한 산사',
    scene: 'Secluded Korean Buddhist mountain temple at deep rainy night. Sheltered view beneath wooden eaves toward an empty wet stone courtyard and forested slopes. Curved tiled roofs and one dim steady warm lantern; original peaceful setting.',
    architecture: ['curved tiled roof', 'wooden pillars', 'temple hall', 'courtyard'], landscape: ['forested slopes'],
    profiles: ['fixed-architecture', 'natural-eave-runoff'],
    details: ['weathered pillars and small stone courtyard', 'curved tiled eaves framing distant pine trees', 'mossy stone stairway beside an empty hall', 'quiet courtyard with one dim sheltered lantern'],
    exclusions: ['urban buildings', 'signs', 'frozen icicle-like runoff'],
    motionKo: '건물은 고정하고 처마의 물이 불규칙하게 끊어지는 낙수와 돌마당의 물튀김만 이어집니다. 등불은 일정합니다.',
  },
  pond: {
    family: 'natural-water', name: '숲속 연못',
    scene: 'Small secluded forest pond at deep rainy night, intimate low shore view. Reeds, fern leaves and mossy stones frame a still pond with delicate concentric rain rings. Dim diffuse ambient night light, deep greens and blue-black shadows; no bright sky.',
    architecture: [], landscape: ['pond bank', 'mossy stones', 'tree trunks'],
    profiles: ['still-pond', 'subtle-vegetation', 'rain-rings'],
    details: ['fern-framed pond edge and moss stones', 'curved reed bank and small rain rings', 'overhanging leaves beside a still pool', 'scattered wet stones and delicate ripples'],
    exclusions: ['stream', 'waterfall', 'structures', 'animals'],
    motionKo: '정적인 연못 위 작은 동심원이 불규칙하게 생겨나고 사라집니다. 갈대는 미세하게 움직이며 계류·폭포는 없습니다.',
  },
  lake: {
    family: 'natural-water', name: '고요한 호수',
    scene: 'Wide secluded lake at deep rainy night from a fixed low shore viewpoint. Broad dark open water, fine rain ripples and distant forested mountain silhouettes with faint mist; a few foreground reeds and wet stones. Low-key diffuse night light without a bright horizon.',
    architecture: [], landscape: ['mountain silhouettes', 'horizon', 'shoreline', 'wet stones'],
    profiles: ['broad-lake', 'subtle-vegetation', 'gentle-ripples'],
    details: ['distant wooded ridge and sparse foreground reeds', 'shallow stone shore and wide dark horizon', 'dark mountain silhouettes with a little mist', 'quiet curved shoreline and distant trees'],
    exclusions: ['ocean surf', 'large waves', 'boats', 'buildings'],
    motionKo: '넓은 호수의 작은 빗물결과 물가의 완만한 잔물결만 이어집니다. 먼 산과 수평선은 고정하며 바다 파도는 없습니다.',
  },
  'highland-village': {
    family: 'architecture', name: '고산 마을',
    scene: 'Remote northern Vietnamese highland village inspired by rural Sa Pa, original setting not a real-location reconstruction. Deep rainy night, weathered timber hillside houses with simple steep pitched corrugated roofs and stone footings. Faint steady warm window lights; terraced slopes and mountain ridges barely visible through low mist. Sheltered view across a wet stone path.',
    architecture: ['timber houses', 'pitched roofs', 'window frames', 'stone steps'], landscape: ['hillside', 'terraced slopes', 'mountain ridges'],
    profiles: ['fixed-architecture', 'natural-eave-runoff', 'slow-mist'],
    details: ['narrow stone path and two timber hillside houses', 'staggered dark roofs below misty terraced slopes', 'small porch overlooking a neighboring warm window', 'weathered wooden walls above wet stone steps'],
    exclusions: ['vehicles', 'resort', 'festival decorations', 'flood damage', 'frozen icicle-like runoff'],
    motionKo: '집과 산비탈은 고정하고 빗줄기와 불규칙한 낙수만 흐릅니다. 먼 안개는 느리게 이동하고 창문 불빛은 일정합니다.',
  },
};
const INPUT_KEYS = ['sceneId', 'intensity', 'thunder', 'camera', 'palette', 'variation', 'title', 'hours', 'takes', 'notes'];
const MOTION_TYPES = ['rain', 'glass-runoff', 'background-translation', 'blanket-breathing', 'tent-fabric', 'eave-runoff', 'vegetation', 'rain-ripples', 'stream', 'mist', 'local-reflection'];
const REGIONS = ['subject', 'shelter', 'exterior', 'water', 'practicalLight'];
const owns = (object, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const issue = (code, path, message, severity = 'error') => ({ code, path, message, severity });

function inputIssues(input) {
  if (!record(input)) return [issue('input-shape', 'sourceInput', '장면 설정이 필요합니다.')];
  const issues = [];
  for (const [key, values] of [['sceneId', SCENE_IDS], ['intensity', Object.keys(INTENSITIES)], ['thunder', ['none', 'distant', 'close']], ['camera', ['wide', 'window', 'bedside']], ['palette', ['amber', 'linen', 'midnight']]]) {
    if (!values.includes(input[key])) issues.push(issue('input-option', `sourceInput.${key}`, '선택할 수 없는 장면 설정입니다.'));
  }
  if (!Number.isInteger(input.variation) || input.variation < 0 || input.variation > 999999) issues.push(issue('input-bounds', 'sourceInput.variation', '변주는 0–999999 정수여야 합니다.'));
  if (![1, 3, 10].includes(input.hours) || ![3, 6, 12].includes(input.takes)) issues.push(issue('input-bounds', 'sourceInput', '기존 길이와 테이크 범위를 확인해 주세요.'));
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100) issues.push(issue('input-bounds', 'sourceInput.title', '제목은 1–100자여야 합니다.'));
  if (typeof input.notes !== 'string' || input.notes.length > 600) issues.push(issue('input-bounds', 'sourceInput.notes', '연출 메모는 600자 이하여야 합니다.'));
  return issues;
}

// This is a narrow contradiction check, not a general interpretation or content filter.
// Unrecognized creative notes remain creative notes and require review.
function noteIssues(notes, hasSubject, sceneId) {
  const issues = [];
  const affirmative = notes.split(/[.!?;\n。]/).filter(part => !/\b(no|not|without|avoid|never|exclude|prevent)\b|금지|없음|없이|없게|않|말고|제외|방지/i.test(part)).join('. ');
  if (hasSubject && notes.split(/[.!?;\n。]/).some(part => !/\b(avoid|prevent|exclude)\b|금지하지|제외|방지/i.test(part) && /\b(no|without) (breathing|people|sleeping (woman|person))\b|호흡\s*(금지|없음|없이)|인물\s*(없음|제거)/i.test(part))) issues.push(issue('notes-subject-conflict', 'fixed.creativeNotes', '수면 인물과 미세한 이불 호흡을 없애는 메모는 이 장면과 충돌합니다.'));
  const rules = [
    ['notes-lighting-conflict', /\b(bright sky|daylight|sunrise|sunset|twilight|golden hour|global flicker|flashing lights|exposure pulsing)\b|밝은 하늘|대낮|석양|황혼|해질녘|전역 깜빡|전체.*번쩍/i, '깊은 밤·고정 노출과 충돌하는 조명 메모입니다.'],
    ['notes-camera-conflict', /\b(camera (pan|tilt|zoom|movement)|moving camera|handheld camera|dolly shot|tracking shot)\b|카메라.*(이동|줌|회전|흔들)|핸드헬드/i, '고정 카메라와 충돌하는 메모입니다.'],
  ];
  if (hasSubject) rules.push(['notes-subject-conflict', /\b(turning over|rolls? over|body completely still|blanket (remains? |stays? |is )?(completely )?(still|motionless)|no breathing)\b|뒤척|몸.*완전.*정지|이불.*(완전.*정지|고정)|호흡.*금지/i, '미세한 이불 호흡과 고정된 얼굴·머리·손 규칙에 맞지 않는 메모입니다.']);
  else rules.push(['notes-people-conflict', /\b(add|include|show) (a |an )?(person|people|woman|man|sleeper)\b|\bsleeping (woman|man|person)\b|\b(blanket breathing|breathing motion)\b|잠든 (인물|여성|남성|사람)|인물.*추가|이불.*호흡/i, '인물이 없는 장면에 인물 또는 호흡을 추가할 수 없습니다.']);
  if (sceneId === 'train') rules.push(['notes-travel-conflict', /\b(train|exterior|forest).{0,50}\b(slow(s|ing)? down|decelerate|stop(s|ping)?|left to right)\b|\b(reverse|reversed) (travel|movement|train)\b|열차.{0,30}(감속|정차|역방향)|왼쪽에서 오른쪽/i, '열차의 정속 오른쪽→왼쪽 이동과 충돌하는 메모입니다.']);
  if (sceneId === 'pond') rules.push(['notes-water-conflict', /\b(add|include|show|with) (a |an )?(rushing )?(stream|waterfall)\b|계류.*추가|폭포.*추가|흐르는 계류/i, '정적인 연못에 계류·폭포를 추가할 수 없습니다.']);
  if (sceneId === 'lake') rules.push(['notes-water-conflict', /\bocean surf\b|\blarge ocean waves\b|바다 파도|거센 파도/i, '잔잔한 호수에 바다 파도를 추가할 수 없습니다.']);
  for (const [code, regex, message] of rules) if (regex.test(affirmative)) issues.push(issue(code, 'fixed.creativeNotes', message));
  return issues;
}

function fail(issues) {
  const error = new Error(issues.filter(item => item.severity === 'error').map(item => item.message).join(' '));
  error.code = 'HEALING_RAIN_DIRECTION_INVALID';
  error.issues = issues;
  throw error;
}

function cameraFor(scene, input) {
  if (scene.camera) return scene.camera[input.camera];
  if (['pond', 'lake'].includes(input.sceneId)) return { wide: 'Wide fixed view across water toward the wooded shore.', window: 'Close fixed view of rain rings, wet reeds and water surface.', bedside: 'Low shore-level fixed view just above the waterline.' }[input.camera];
  if (input.sceneId === 'night-nature') return { wide: 'Wide static canyon vista.', window: 'Close fixed view of mossy rocks and rain through foliage.', bedside: 'Low sheltered bank viewpoint toward the quiet stream.' }[input.camera];
  if (scene.family === 'sleeping-shelter') return { wide: 'Wide fixed composition showing shelter, sleeping woman and exterior.', window: 'Sheltered opening prominent; retain the sleeping woman and interior context.', bedside: 'Fixed view beside the resting area toward rain, with a natural sleeping side profile.' }[input.camera];
  return { wide: 'Wide static view of the empty grounds and trees.', window: 'Close sheltered fixed view toward wet stone and rain.', bedside: 'Low fixed sheltered viewpoint toward the quiet grounds.' }[input.camera];
}

function paletteFor(scene, input) {
  if (scene.family === 'sleeping-shelter') return { amber: 'Dark walnut or earth tones and muted amber accents; warm face and bedding remain readable.', linen: 'Ivory bedding in gentle warm light, with controlled highlights and readable face.', midnight: 'Deep navy fabrics and a shielded warm sleep light; preserve readable face and bedding.' }[input.palette];
  if (scene.family === 'natural-water') return { amber: 'Near-black olive greens and restrained neutral wet highlights; no artificial lamp.', linen: 'Dim desaturated grey-green stone and diffuse soft night light; no artificial lamp.', midnight: 'Deep blue-black shadows and subdued moss greens under low diffuse night light.' }[input.palette];
  return { amber: 'Dark olive greens, warm shielded practical lights and restrained wet reflections.', linen: 'Dim grey-green stone, diffuse night ambience and steady warm practical light.', midnight: 'Deep blue-black exterior shadows and a small steady warm practical light.' }[input.palette];
}

function makeDirection(input) {
  const scene = SCENES[input.sceneId];
  const hasSubject = scene.family === 'sleeping-shelter';
  const hasPractical = scene.family !== 'natural-water';
  const hasShelter = !['night-nature', 'quiet-park', 'pond', 'lake'].includes(input.sceneId);
  const motion = [{ id: 'rain', region: 'exterior', target: 'rain', type: 'rain', direction: 'downward', amplitude: input.intensity, periodSeconds: null, instruction: INTENSITIES[input.intensity].en + ' Keep density steady; rain stays outside shelter.' }];
  function add(id, region, target, type, direction, amplitude, periodSeconds, instruction, extra = {}) { motion.push({ id, region, target, type, direction, amplitude, periodSeconds, instruction, ...extra }); }
  if (input.sceneId === 'train') add('travel', 'exterior', 'near foliage and distant landscape', 'background-translation', 'right-to-left', 'brisk', null, 'Brisk constant RIGHT TO LEFT travel through both ends; near foliage crosses window width in about 1–2s, distant landscape slower. No slowing, stops or reversal.', { speed: { nearCrossingSeconds: [1, 2], distant: 'slower-than-near', constant: true, targetStatus: 'initial-descriptive-target' } });
  if (['train', 'cabin'].includes(input.sceneId)) add('glass', 'shelter', 'window droplets', 'glass-runoff', 'downward', 'small', null, 'Glass drops merge and flow down irregularly; no rigid water strands.');
  if (hasSubject) add('breathing', 'subject', 'blanket over torso', 'blanket-breathing', 'rise-and-fall', 'tiny', 5, 'Only tiny blanket breathing, about 5s per cycle; stable face, head and hands, no turning over.', { phase: 'match-0–1s-with-10–11s', targetStatus: 'initial-descriptive-target' });
  if (input.sceneId === 'tent') add('fabric', 'shelter', 'tent fabric', 'tent-fabric', 'small-local-deflection', 'tiny', null, 'Tiny local tent-fabric movement; poles, seams and dry inner floor stay fixed.');
  if (scene.profiles.includes('natural-eave-runoff')) add('eaves', 'shelter', 'eave runoff', 'eave-runoff', 'downward', 'small-irregular', null, 'Eave runoff flows and breaks into irregular falling drops, never frozen icicles.');
  if (['tent', 'cabin', 'night-nature', 'quiet-park', 'pond', 'lake'].includes(input.sceneId)) add('leaves', 'exterior', 'leaves or reeds', 'vegetation', 'small-local-sway', 'tiny', null, 'Leaves or reeds barely move; trunks, rocks and ground remain fixed.');
  if (!hasSubject) add('ripples', 'water', 'rain impact rings', 'rain-ripples', 'outward', 'small', null, input.sceneId === 'pond' ? 'Still pond: small irregular concentric rain rings appear and fade; no stream or waterfall.' : input.sceneId === 'lake' ? 'Broad lake: small rain ripples and gentle shore lapping; no ocean surf or large waves.' : 'Small irregular rain-impact rings and local splashes; water stays calm.');
  if (input.sceneId === 'night-nature') add('stream', 'water', 'quiet stream', 'stream', 'downstream', 'slow', null, 'Quiet stream flows slowly downstream; no waterfall or surging current.');
  if (input.sceneId === 'highland-village') add('mist', 'exterior', 'distant mist', 'mist', 'slow-drift', 'tiny', null, 'Distant mist drifts slowly; houses and mountain ridges stay fixed.');
  if (hasPractical) add('reflection', 'practicalLight', 'small wet reflections near the fixed light', 'local-reflection', 'local-only', 'tiny', null, 'Only tiny local wet reflections vary; light sources stay steady.');
  const lightKo = hasSubject ? '실내는 따뜻하고 얼굴·침구가 읽히며, 바깥은 푸른 잔광 없는 깊은 밤입니다. 광원과 노출은 일정하고 작은 국소 반사만 허용합니다.' : input.sceneId === 'hanok' ? '따뜻한 방과 어두운 마당을 분리하고 노출·광원은 일정하게 유지합니다.' : '깊은 밤의 낮은 밝기와 읽히는 빗결을 유지합니다. 하늘·노출·광원은 일정하며 전역 깜빡임은 없습니다.';
  const summaryDetails = {
    subject: hasSubject ? '아름다운 성인 여성의 자연스러운 수면 옆모습. 얼굴·머리·손은 안정적으로 유지하고 약 5초 주기의 미세한 이불 호흡만 허용합니다.' : '인물이 없는 장면입니다. 인물·호흡 움직임을 추가하지 않습니다.',
    motion: `${INTENSITIES[input.intensity].ko}. ${scene.motionKo}`,
    lighting: lightKo,
    loop: '11초 원본 → 1초 겹침 → 10초 주기, 24fps. 0–1초와 10–11초의 고정 요소·조명·호흡 위상을 검수합니다. 30초·180초 미리보기만 연결합니다.',
    verification: '명세 충돌 검사는 생성 전 수행합니다. 영상·오디오 기본 검사는 렌더 후 수행하며 영역 밝기·속도·인물 안정성·자연스러움은 검수 필요입니다. 영역을 확실히 찾지 못하면 통과 처리하지 않습니다.',
  };
  return {
    version: DIRECTION_VERSION, sceneId: input.sceneId,
    sourceInput: Object.fromEntries(INPUT_KEYS.map(key => [key, input[key]])),
    profiles: ['deep-night', 'locked-camera', 'stable-geometry', ...scene.profiles],
    fixed: {
      scene: scene.scene, camera: { mode: 'locked', composition: cameraFor(scene, input) },
      people: hasSubject ? 'one-sleeping-adult-woman' : 'none',
      subject: hasSubject ? { description: 'One beautiful adult woman sleeping naturally in a comfortable side profile under a blanket or sleeping bag.', face: 'stable', head: 'stable', hands: 'stable', bodyMotion: 'blanket-breathing-only' } : null,
      architecture: scene.architecture.slice(), landscape: scene.landscape.slice(),
      palette: paletteFor(scene, input), variation: scene.details[input.variation % scene.details.length],
      exclusions: ['daylight', 'twilight', 'bright sky', 'camera movement', 'cuts', 'text', 'logos', 'lightning', ...(hasSubject ? ['turning over', 'face or hand movement'] : ['people', 'breathing']), ...scene.exclusions],
      creativeNotes: input.notes.trim(),
    },
    motion,
    lighting: {
      timeOfDay: 'deep-night', sky: 'deep-dark', exposure: 'fixed', globalVariation: 'none',
      instruction: hasSubject ? 'Warm readable face and bedding inside; exterior stays deep dark, no twilight. Fixed exposure and steady lights; no global flicker.' : 'Constant dark exposure with readable rain; no bright sky, flashes or global flicker. Practical lights, if present, stay steady.',
      regions: [
        { id: 'subject', applicable: hasSubject, brightness: hasSubject ? 'warm-readable' : 'absent', source: hasSubject ? 'shielded-practical' : 'none', allowedVariation: 'none' },
        { id: 'shelter', applicable: hasShelter, brightness: hasSubject || input.sceneId === 'hanok' ? 'warm-readable' : hasShelter ? 'dim-readable' : 'absent', source: hasShelter ? 'steady-practical' : 'none', allowedVariation: 'none' },
        { id: 'exterior', applicable: true, brightness: 'deep-dark', source: 'faint-diffuse-night', allowedVariation: 'tiny-local-rain-reflections' },
        { id: 'water', applicable: !hasSubject, brightness: !hasSubject ? 'restrained-highlights' : 'absent', source: !hasSubject ? 'reflected-ambient' : 'none', allowedVariation: !hasSubject ? 'tiny-local-ripples' : 'none' },
        { id: 'practicalLight', applicable: hasPractical, brightness: hasPractical ? 'shielded-warm' : 'absent', source: hasPractical ? 'fixed-lamp-or-window' : 'none', allowedVariation: hasPractical ? 'tiny-local-reflections-only' : 'none' },
      ],
    },
    loop: { sourceSeconds: 11, cycleSeconds: 10, overlapSeconds: 1, fps: 24, reversePlayback: false, boundary: 'Match fixed geometry, light and breathing phase at 0–1s / 10–11s; moving rain and exterior continue forward.', phaseGuarantee: 'requires-media-review' },
    longEvents: { enabled: false, requestedThunder: input.thunder, thunder: { enabled: false, placement: 'separate-long-edit-only' }, turningOver: { enabled: false, placement: 'future-long-event-only' } },
    verification: {
      status: 'review-required', unknownRegions: 'review-required', regionExtraction: 'not-run',
      checks: [
        { id: 'technical-media', status: 'not-run', method: 'existing-render-checks', criteria: '영상 길이·프레임·타임스탬프, 오디오 무음·클리핑 검사' },
        { id: 'loop-boundary', status: 'review-required', method: 'human-review', criteria: '0–1초와 10–11초의 고정 요소·조명·호흡 위상과 시작·끝 소리 연결' },
        { id: 'region-lighting', status: 'not-implemented', method: 'planned-region-analysis', criteria: '인물·실내·실외·수면·광원 영역의 밝기와 전역 깜빡임 검수' },
        { id: 'motion-stability', status: 'not-implemented', method: 'planned-motion-analysis', criteria: '카메라·기하·인물 안정성과 장면별 이동 방향·속도 검수' },
        { id: 'naturalness', status: 'review-required', method: 'human-review', criteria: '최초 규칙군·모델 변경·새 동작·이상치와 표본의 자연스러움 검수' },
      ],
      coverage: { scopedSceneId: input.sceneId, representativePassCoversOtherProfiles: false, additionalMotionReview: input.sceneId === 'night-nature' ? ['slow-stream'] : [], automaticChecksGuaranteeNaturalness: false },
    },
    summaryDetails, summary: `${scene.name} · ${summaryDetails.subject} ${summaryDetails.motion} ${summaryDetails.lighting} ${summaryDetails.loop}`,
  };
}

function buildDirection(input) {
  const issues = inputIssues(input);
  if (issues.length) fail(issues);
  const direction = makeDirection(input);
  const validation = validateDirection(direction);
  if (!validation.valid) fail(validation.issues);
  return direction;
}

// Order-independent equality keeps JSON persisted/reloaded directions interoperable.
function equivalent(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => equivalent(item, b[index]));
  if (record(a) && record(b)) { const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => owns(b, key) && equivalent(a[key], b[key])); }
  return false;
}

function validateDirection(direction) {
  if (!record(direction)) return { valid: false, issues: [issue('direction-shape', 'direction', '연출 명세가 필요합니다.')] };
  const issues = [];
  if (direction.version !== DIRECTION_VERSION) issues.push(issue('direction-version', 'version', '지원하지 않는 연출 규칙 버전입니다.'));
  const sourceIssues = inputIssues(direction.sourceInput);
  issues.push(...sourceIssues);
  const fixed = record(direction.fixed) ? direction.fixed : {};
  const motion = Array.isArray(direction.motion) ? direction.motion : [];
  const lighting = record(direction.lighting) ? direction.lighting : {};
  const loop = record(direction.loop) ? direction.loop : {};
  const breathing = motion.some(item => record(item) && item.type === 'blanket-breathing');
  if (fixed.people === 'none' && (breathing || fixed.subject)) issues.push(issue('people-breathing-conflict', 'motion', '인물이 없는 장면에는 인물·호흡 움직임이 있을 수 없습니다.'));
  if (breathing && (!record(fixed.subject) || fixed.subject.bodyMotion !== 'blanket-breathing-only')) issues.push(issue('frozen-subject-conflict', 'fixed.subject', '이불 호흡은 완전 정지 지시와 함께 사용할 수 없습니다.'));
  if (record(fixed.subject) && ['face', 'head', 'hands'].some(key => fixed.subject[key] !== 'stable')) issues.push(issue('subject-stability', 'fixed.subject', '얼굴·머리·손은 안정적으로 유지해야 합니다.'));
  if (fixed.camera?.mode !== 'locked') issues.push(issue('camera-stability', 'fixed.camera.mode', '카메라는 고정되어야 합니다.'));
  if (lighting.timeOfDay !== 'deep-night' || lighting.sky !== 'deep-dark') issues.push(issue('night-lighting-conflict', 'lighting', '깊은 밤과 어두운 하늘을 유지해야 합니다.'));
  if (lighting.exposure !== 'fixed' || lighting.globalVariation !== 'none') issues.push(issue('exposure-conflict', 'lighting', '고정 노출과 전역 깜빡임 금지를 유지해야 합니다.'));
  if (loop.sourceSeconds !== 11 || loop.cycleSeconds !== 10 || loop.overlapSeconds !== 1 || loop.fps !== 24 || loop.reversePlayback !== false) issues.push(issue('loop-contract', 'loop', '11초 원본·10초 주기·1초 겹침·24fps 정방향 루프가 필요합니다.'));
  if (direction.longEvents?.enabled !== false || direction.longEvents?.thunder?.enabled !== false || direction.longEvents?.turningOver?.enabled !== false) issues.push(issue('long-events-disabled', 'longEvents', '미리보기에서 천둥·뒤척임 등의 긴 이벤트는 비활성 상태여야 합니다.'));
  for (const [index, item] of motion.entries()) {
    if (!record(item) || !MOTION_TYPES.includes(item.type) || !REGIONS.includes(item.region)) { issues.push(issue('motion-shape', `motion.${index}`, '지원하지 않는 움직임 명세입니다.')); continue; }
    if (item.type === 'blanket-breathing' && (item.periodSeconds !== 5 || item.amplitude !== 'tiny')) issues.push(issue('breathing-bounds', `motion.${index}`, '호흡은 약 5초 주기의 미세한 이불 움직임이어야 합니다.'));
    if (item.type === 'background-translation' && (item.direction !== 'right-to-left' || item.speed?.constant !== true || !equivalent(item.speed?.nearCrossingSeconds, [1, 2]) || item.speed?.distant !== 'slower-than-near')) issues.push(issue('train-travel', `motion.${index}`, '열차 외부는 가까운 수풀 1–2초 통과 목표와 느린 먼 풍경으로 오른쪽→왼쪽 정속 이동해야 합니다.'));
    if (direction.sceneId === 'pond' && item.type === 'stream') issues.push(issue('pond-stream-conflict', `motion.${index}`, '연못에는 계류·폭포를 추가하지 않습니다.'));
  }
  if (typeof fixed.creativeNotes === 'string') issues.push(...noteIssues(fixed.creativeNotes, fixed.people !== 'none', direction.sceneId));
  if (!sourceIssues.length) {
    const canonical = makeDirection(direction.sourceInput);
    for (const key of ['sceneId', 'profiles', 'fixed', 'motion', 'lighting', 'loop', 'longEvents', 'summaryDetails', 'summary']) {
      if (!equivalent(direction[key], canonical[key])) issues.push(issue('direction-provenance', key, `연출 ${key} 값이 저장된 입력과 규칙 버전에 맞지 않습니다. 다시 저장해 주세요.`));
    }
    // Validation is a pre-generation specification check, never visual approval.
    if (!equivalent(direction.verification, canonical.verification)) issues.push(issue('verification-provenance', 'verification', '계획의 검수 상태는 미검수 상태여야 합니다. 실제 검수 결과는 생성 결과에 별도로 기록해 주세요.'));
  }
  return { valid: !issues.some(item => item.severity === 'error'), issues };
}

function compileDirection(direction, input) {
  const validation = validateDirection(direction);
  const issues = [...validation.issues, ...inputIssues(input)];
  if (!equivalent(direction?.sourceInput, record(input) ? Object.fromEntries(INPUT_KEYS.map(key => [key, input[key]])) : input)) issues.push(issue('input-provenance', 'sourceInput', '저장된 연출 명세와 현재 입력이 다릅니다. 다시 저장해 주세요.'));
  if (issues.some(item => item.severity === 'error')) fail(issues);
  const fixed = direction.fixed;
  const image = [
    'Photorealistic cinematic 16:9 source image for a fixed-camera loop.', fixed.scene,
    fixed.subject ? fixed.subject.description : 'No people or sleeping subjects.',
    fixed.camera.composition, fixed.palette, `Set dressing: ${fixed.variation}.`,
    INTENSITIES[input.intensity].en, direction.lighting.instruction,
    'Keep architecture, landscape anchors and anatomy stable. Rain remains outside any dry shelter.',
    `Exclude: ${fixed.exclusions.join(', ')}.`,
    `Creative set-dressing direction within these fixed rules: ${fixed.creativeNotes || 'quiet restorative rain ambience'}.`,
  ].join(' ');
  const video = [
    `${direction.loop.sourceSeconds}-second source shot from the approved image. Locked camera; preserve composition, anatomy and architecture.`,
    fixed.subject ? 'One beautiful adult woman sleeps in natural side profile.' : 'No people or breathing.',
    ...direction.motion.map(item => item.instruction),
    direction.lighting.instruction,
    direction.loop.boundary,
    'No cuts, zoom, morphing, lightning, text or logos. Ending image guides fixed composition only.',
  ].join(' ');
  if (video.length > 1500) fail([issue('video-prompt-bounds', 'video', '영상 연출 프롬프트는 1500자 이하여야 합니다.')]);
  return {
    image, video,
    checks: direction.verification.checks.map(check => check.criteria),
    render: { seconds: 180, previewSeconds: 30, sourceVideoSeconds: direction.loop.sourceSeconds, targetVideoCycleSeconds: direction.loop.cycleSeconds, videoCrossfadeSeconds: direction.loop.overlapSeconds, audioCrossfadeSeconds: 2, fps: direction.loop.fps, maxWidth: 1920 },
    summary: direction.summary,
  };
}

module.exports = { DIRECTION_VERSION, SCENE_IDS, buildDirection, validateDirection, compileDirection };
