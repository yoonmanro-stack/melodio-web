'use strict';

// Draft, unreviewed audition specifications. This module performs no generation,
// registration, or publication. The catalog pipeline owns OFFICIAL metadata.
// Shared native-language lyrics make the different vocal timbres comparable.

const LYRICS = {
  en: [
    `[Verse]
I leave a little light beside the door
Your empty cup is waiting as before
The rain has drawn a river down the street
I follow where the quiet waters meet
A window opens somewhere overhead
I keep the gentle words we never said
[Chorus]
Carry this small light across the night
Let it find a place to settle right
Every step can bring us something new
There is still a road from me to you
[Outro]
Let the morning open slow and wide
I will keep a little light inside`,
    `[Verse]
The station clock is running slow today
A paper bird goes sailing far away
I count the trees beyond the moving glass
And watch the little painted houses pass
My pocket holds a stone from by the sea
A quiet bit of home to carry with me
[Chorus]
Take me where the open rivers bend
Every turn can be a place to mend
I can start again beneath this sky
With an open hand and steady eyes
[Outro]
When the evening train comes rolling through
I will have a different story for you`,
    `[Verse]
We plant a little garden on the roof
Two crooked chairs and sunlight are our proof
The city hums beneath the wooden floor
A silver cloud goes drifting past the door
You laugh and let the water touch your sleeve
There is so much room for us to breathe
[Chorus]
Let the small things grow into the day
Let the restless hours fall away
Here between the leaves and open blue
I can hear the world begin anew
[Outro]
When the summer shadows start to climb
We will give the growing flowers time`,
  ],
  ja: [
    `[Verse]
窓辺に残る雨の音
冷めたお茶を両手で包む
遠くの街に灯りがともる
言えない言葉をそっとほどく
曲がり角で風が笑う
明日の色を探している
[Chorus]
小さな光を胸に抱いて
まだ知らない道を歩こう
立ち止まる日も空は続く
私の歩幅で朝へ向かう
[Outro]
雨の向こうで鳥が歌う
新しい日が静かに開く`,
    `[Verse]
夕焼け色の電車に揺られ
流れる屋根を指で数える
ポケットの中の丸い小石
あの日の海を覚えている
誰かの庭に白い花
見慣れぬ駅で風を待つ
[Chorus]
遠回りでも帰れる場所へ
心の地図を広げてみよう
なくした夢の続きなら
今いるここから描けばいい
[Outro]
窓に映った小さな笑顔
明日もきっと連れて行こう`,
    `[Verse]
屋上の隅に種をまいた
古い椅子を二つ並べる
街のざわめき雲まで届く
あなたの袖に水がはねる
名前も知らない鳥が来て
午後の光を分け合った
[Chorus]
ゆっくり伸びる葉のように
急がず今日を育てていこう
何もない日と思っていた
こんなに優しい風がある
[Outro]
影が長くなるその前に
小さな花へ水をあげよう`,
  ],
  fr: [
    `[Verse]
Je garde une lampe au bord de la fenêtre
La pluie sur les toits commence à disparaître
Une tasse attend sur le vieux rebord
Le vent dans la rue nous appelle encore
Je range les mots au fond de mes poches
Le matin revient, je le sens tout proche
[Chorus]
Porte cette lumière au milieu du soir
Fais de chaque pas un morceau d'espoir
Même si la route change sous nos yeux
Nous pouvons marcher vers un ciel plus bleu
[Outro]
Quand le jour viendra réveiller la ville
Je garderai ce feu tranquille`,
    `[Verse]
Le train longe un champ de fleurs endormies
Les maisons s'effacent au bord de la nuit
Un caillou tout rond repose dans ma main
Il connaît la mer et tous ses refrains
À chaque fenêtre un monde se dessine
Je laisse partir les ombres des collines
[Chorus]
Laisse la rivière inventer son chemin
Je peux commencer avec presque rien
Sous le même ciel il reste de la place
Pour un pas nouveau, pour un jour qui passe
[Outro]
Quand le train ralentit au bout du voyage
Je tourne doucement la dernière page`,
    `[Verse]
Nous avons semé quelques graines sur le toit
Deux chaises de bois attendent près de moi
La ville murmure au-dessous des nuages
Un peu d'eau s'échappe et mouille ton visage
Tu ris et le temps desserre enfin ses mains
Une feuille danse au milieu du jardin
[Chorus]
Laissons les petites choses grandir au soleil
Donnons à nos jours un début de merveille
Entre les feuilles et le bleu du ciel
Chaque instant ordinaire devient essentiel
[Outro]
Quand les ombres viendront traverser les fleurs
Nous prendrons le temps d'écouter nos cœurs`,
  ],
};

// Row fields: name, Korean UI description, Korean timbre tags, English identity.
const VOICES = {
  en: {
    female: [
      [
        'June Cinder',
        '낮은 가슴 울림에 거친 숨결이 붙는 드라이한 허스키 알토',
        ['저음', '허스키', '가슴 울림', '드라이'],
        'Low contralto center, heavy chest resonance and coarse sand-like grain on sustained vowels. Dry, almost spoken attacks open into broad, stable notes. Keep the lower register dense and the upper register restrained, with little vibrato and no habitual whispering.',
      ],
      [
        'Mara Flint',
        '묵직한 중저음에서 금속성 고음으로 뻗는 록 메조',
        ['묵직함', '거친 결', '금속성', '록'],
        'A weighty mezzo with a compact, slightly ragged middle and a hard silver ring in the upper mix. Firm consonant-led attacks, quick releases and straight sustained peaks. Let a little natural rasp appear under pressure while preserving a solid pitched core.',
      ],
      [
        'Cleo Saffron',
        '콧소리의 날카로운 초점과 스모키한 중음이 만나는 소울 보컬',
        ['비음', '스모키', '소울', '탄력'],
        'Forward nasal bite over a smoky, medium-low mezzo body. Elastic, lightly syncopated phrasing with small scoops into notes and quick, narrow vibrato at phrase ends. The tone feels compact and tangy rather than breathy, with an audible edge on bright vowels.',
      ],
      [
        'Eden Brass',
        '두꺼운 저음과 단단한 발성 시작이 돋보이는 황동빛 메조',
        ['두꺼운 저음', '단단한 어택', '황동빛', '직선적'],
        'Dense lower-mezzo chest tone with a brassy, open middle. Clean, dry onsets and broad vowels give each syllable firm weight. Rise into a rounded chest-dominant belt without a piercing head tone; use slow, shallow vibrato only after a long straight hold.',
      ],
      [
        'Tessa Velvet',
        '부드럽게 눌린 어택 아래 두꺼운 몸통이 남는 무광 알토',
        ['무광', '두꺼운 음색', '낮은 중음', '절제'],
        'Matte alto with a thick, close low-middle register and a lightly frayed edge. Soft-edged onsets retain vocal density rather than dissolving into air. Narrow dynamic movement, unhurried syllables and a dark, almost felted upper register create an intimate but substantial tone.',
      ],
      [
        'Nora Willow',
        '둥근 모음과 고른 호흡으로 따뜻하게 이어지는 서정적 메조',
        ['따뜻함', '둥근 모음', '매끄러움', '서정적'],
        'Warm lyrical mezzo with rounded vowels, a clean medium register and supple connected legato. Gentle, balanced onsets and an even breath flow; a small natural vibrato blooms late. Keep the tone clear and mellow, with minimal grain and an easy, unforced upper extension.',
      ],
      [
        'Wren Silver',
        '가벼운 공기층 너머 맑은 고음이 반짝이는 소프라노',
        ['공기감', '맑은 고음', '가벼움', '투명함'],
        'Light soprano with a fine airy halo around a clear, bell-like pitch center. Delicate lifted onsets, slender low notes and floating head-dominant high notes. Maintain intelligible consonants and a narrow, quick vibrato, keeping the timbre luminous rather than thick or raspy.',
      ],
      [
        'Ruby Tide',
        '넓은 저음 공명과 거친 음 끝을 지닌 깊은 소울 알토',
        ['깊은 저음', '넓은 공명', '소울', '거친 음 끝'],
        'Dark, full alto with spacious low resonance and a warm, worn edge at the ends of phrases. Use rounded, lingering vowels, occasional gentle chest growl and slow bends into sustained notes. A broad but controlled vibrato distinguishes the upper middle from the steady bass-like lows.',
      ],
    ],
    male: [
      [
        'Owen Slate',
        '짧고 건조한 어택에 자갈 같은 결이 남는 베이스 바리톤',
        ['깊은 저음', '자갈 같은 결', '드라이', '짧은 어택'],
        'Bass-baritone with a low, gravel-textured chest center and short, plucked vocal onsets. Closely shaped vowels, minimal breath leakage and nearly straight sustained tones. Let the upper middle stay blunt and woody; keep the lowest notes pitched and resonant rather than spoken fry.',
      ],
      [
        'Silas Copper',
        '구리빛 중음과 넓은 흉성이 울리는 거친 바리톤',
        ['구리빛', '바리톤', '거친 결', '넓은 흉성'],
        'Rugged middle baritone with a coppery buzz and broad chest resonance. Rounded attacks develop a rough outer edge as notes grow, then settle into warm, steady endings. Moderate open vowels and a relaxed, medium-width vibrato give the voice sturdy, earthy presence.',
      ],
      [
        'Noah Reed',
        '가느다란 중음과 또렷한 비음이 앞으로 나오는 테너',
        ['비음', '가느다란 음색', '선명한 발음', '리드 같은 결'],
        'Lean tenor with a reedy middle, focused nasal resonance and a wiry upper edge. Crisp tongue consonants and lightly pinched vowels make the tone immediate. Use nimble small pitch turns, little low-register weight and a fast, narrow vibrato without adding airy softness.',
      ],
      [
        'Eli North',
        '곧게 솟는 고음과 밝은 금속성 울림의 록 테너',
        ['고음', '금속성 울림', '직선적', '록'],
        'Bright high tenor with a clear steel ring and an energized, forward upper mix. Clean decisive onsets, open sustained vowels and quick rhythmic releases. Hold peaks straight before a brief tight vibrato; keep the middle lean and firmly voiced with only a trace of grit.',
      ],
      [
        'Theo Moss',
        '어둡고 촘촘한 저중음에 미세한 거친 결이 섞인 바리톤',
        ['어두움', '촘촘한 저음', '미세한 거친 결', '차분함'],
        'Low baritone with dark, close-knit resonance, a smoky surface and fine grain through the lower middle. Gentle compressed onsets and compact vowels keep the delivery quiet but solid. Restrained pitch slides, long unbroken notes and very little vibrato; upper notes remain covered.',
      ],
      [
        'Finn Harbor',
        '얇은 숨결과 부드러운 고음 전환을 지닌 가까운 테너',
        ['숨결', '부드러움', '가벼운 테너', '가까운 음색'],
        'Light intimate tenor with an audible fine breath edge and a slender, clean core. Easy head-voice transitions, soft consonants and small descending inflections. Avoid chest heaviness; let sustained upper notes float with a slight wavering vibrato while remaining clearly pitched.',
      ],
      [
        'Hugo Vale',
        '매끈한 중음과 둥글게 퍼지는 모음의 서정적 바리톤',
        ['매끄러움', '둥근 울림', '서정적', '안정감'],
        'Mellow lyrical baritone with smooth, rounded resonance and an even middle register. Balanced onsets, long connected vowel lines and gently articulated consonants. Use an unhurried, regular vibrato and a seamless rise into the upper middle, with almost no rasp or nasal bite.',
      ],
      [
        'Jude Ember',
        '사포 같은 중음과 따뜻한 흉성이 탄력 있게 움직이는 소울 테너',
        ['사포 같은 결', '따뜻한 흉성', '소울', '탄력'],
        'Low tenor with sandpaper grain in the middle and warm chest-led resonance underneath. Rounded scoops, buoyant rhythmic placement and brief pressed accents give a lived-in soul character. Let high notes narrow into a bright cry, with flexible vibrato and a dry, textured release.',
      ],
    ],
  },
  ja: {
    female: [
      [
        'Sumi Kagero',
        '좁고 낮은 공명에 짙은 자갈 결이 실린 허스키 알토',
        ['낮은 알토', '짙은 허스키', '좁은 공명', '절제'],
        'Low alto with concentrated, narrow chest resonance and a dark gravelly surface. Slightly creaky but pitched beginnings lead to firm, unsentimental sustained vowels. Preserve crisp mora timing, tiny pitch inflections and a dry, almost motionless ending instead of a broad vibrato.',
      ],
      [
        'Rikka Kohaku',
        '짙은 저음 몸통에 날카로운 전방 울림이 붙는 단단한 메조',
        ['짙은 저음', '단단한 어택', '전방 울림', '밀도'],
        'Dense dark mezzo with a rounded low chest core and a focused amber buzz above it. Firm, lightly glottal attacks alternate with smooth long vowels. The upper middle has a controlled nasal edge and tight late vibrato; keep every register substantial and minimally breathy.',
      ],
      [
        'Mika Akatsuki',
        '선명한 자음에서 강한 은빛 고음으로 이어지는 록 메조',
        ['은빛 고음', '선명한 자음', '록', '강한 울림'],
        'Forward mezzo with a taut, metallic upper mix and a bright, lightly serrated middle. Clipped consonant releases and compact vowel shapes make the line incisive. Build to ringing straight high notes, allowing a short rasp at peaks while keeping pitch clear and the lows dry.',
      ],
      [
        'Nagi Shirabe',
        '종이처럼 바스락거리는 결을 지닌 낮고 담백한 콘트랄토',
        ['콘트랄토', '바스락거리는 결', '드라이', '담백함'],
        'Muted contralto with papery rasp across the low middle and a narrow, matte resonance. Gentle speech-like entrances, precise unhurried syllables and short trailing releases. Keep the voice intimate but chest-supported, with little air, almost no vibrato and a subdued upper extension.',
      ],
      [
        'Yori Hibana',
        '두꺼운 저음과 탄력 있는 음 굴림이 돋보이는 거친 소울 메조',
        ['두꺼운 저음', '소울', '거친 결', '탄력 있는 음 굴림'],
        'Chest-heavy mezzo with textured low notes and a springy, slightly compressed onset. Small blues-like scoops and elastic timing open into broad ringing middle vowels. Use a smoky edge, a brief throat catch at selected phrase ends and irregular shallow vibrato, without losing diction.',
      ],
      [
        'Aya Mizukane',
        '낮은 윙윙거림과 곧게 뻗는 상중음이 대비되는 강한 알토',
        ['낮은 울림', '전방 초점', '곧은 상중음', '강한 밀도'],
        'Strong alto with a low buzzing chest resonance and a narrow, almost metallic front focus. Deliberate dry attacks and straight upward connections create a firm contour. The upper middle rings cleanly over a rougher low register; vibrato is tight, brief and reserved for final notes.',
      ],
      [
        'Koto Fuyune',
        '마른 리드 같은 중음과 거친 음 시작이 또렷한 메조',
        ['리드 같은 중음', '마른 질감', '거친 어택', '선명함'],
        'Middle mezzo with a dry reed-like core, small nasal cavities in the tone and a rough edge at each fresh attack. Keep vowels narrow and rhythmic syllables distinctly separated. A thin bright upper register contrasts with a woody middle; avoid plush legato and use minimal vibrato.',
      ],
      [
        'Ruri Amagiri',
        '깊은 흉성과 잔잔한 거친 결이 오래 남는 묵직한 알토',
        ['깊은 흉성', '묵직함', '잔잔한 거친 결', '긴 여운'],
        'Deep alto with wide chest resonance, a softly ragged surface and a firm dark pitch center. Rounded legato entrances and long sustained vowels carry quiet weight. Keep breath noise low, soften consonant edges and allow a slow, small vibrato only near the end of extended notes.',
      ],
      [
        'Hana Komorebi',
        '따뜻한 중음과 유연한 호흡으로 자연스럽게 이어지는 메조',
        ['따뜻한 중음', '유연함', '매끄러움', '편안함'],
        'Warm light mezzo with a smooth, honey-colored middle and gently rounded vowels. Easy balanced onsets, flowing mora connections and relaxed breath support. Let higher notes brighten gradually without a sharp register break; use a delicate regular vibrato and almost no rasp.',
      ],
      [
        'Mei Suiren',
        '얇은 공기층과 부유하는 두성의 밝은 소프라노',
        ['공기감', '두성', '밝은 고음', '가벼움'],
        'Airy soprano with a translucent high head register and a very light lower middle. Feathered attacks leave a fine breath halo around a stable pitch. Crisp but gentle consonants, smoothly lifted phrase endings and a quick tiny vibrato keep the delivery luminous and floating.',
      ],
      [
        'Iroha Tsukishiro',
        '차갑고 맑은 두성에 유리 같은 선명도가 있는 소프라노',
        ['차가운 맑음', '유리 같은 음색', '두성', '정확한 어택'],
        'Cool clear soprano with a glassy, narrow head resonance and a clean, non-breathy core. Exact light onsets and evenly sustained vowels produce a poised, precise line. Upper notes have a small piercing ring, lows remain slender, and vibrato stays nearly absent until final releases.',
      ],
      [
        'Yuzu Harunami',
        '콧소리의 초점과 밝은 트웽이 경쾌하게 튀는 라이트 메조',
        ['밝은 비음', '트웽', '경쾌함', '또렷한 음절'],
        'Adult light mezzo with a bright nasal point, taut twang and a small, agile middle register. Springy clean attacks and quickly shaped vowels make syllables bounce. Use compact slides and little sustained vibrato; keep the lower register lightly buzzy and the upper notes crisp rather than airy.',
      ],
    ],
    male: [
      [
        'Ren Iwato',
        '건조한 저음 시작과 깊은 중심을 지닌 낮은 베이스',
        ['깊은 저음', '베이스', '건조한 어택', '안정된 중심'],
        'Low bass with a deep stable chest center, dry creaky onsets and compact vowel resonance. Keep low notes fully pitched, consonants deliberate and long holds nearly still. The middle register remains dark and close with a subtle coarse edge, never expanding into a bright theatrical sound.',
      ],
      [
        'Daigo Sazanami',
        '나무 같은 흉성과 좁은 모음이 단단하게 맺히는 바리톤',
        ['나무 같은 울림', '단단한 흉성', '좁은 모음', '바리톤'],
        'Firm chest baritone with woody resonance and tightly shaped middle vowels. Slightly percussive onsets, clear consonant boundaries and short controlled phrase endings. A dry low register supports a modest brassy upper middle; keep the vibrato shallow and the emotional weight in vocal density.',
      ],
      [
        'Itsuki Kurogane',
        '거친 중음이 압축된 강한 고음으로 뻗는 로우 테너',
        ['거친 중음', '압축된 고음', '록', '강한 밀도'],
        'Low tenor with a rough, fibrous middle and a compressed iron-bright upper mix. Firm voiced attacks build into ringing peaks with a controlled rasp around the pitch. Use short straight holds and abrupt clean releases; maintain a chesty middle and clear mora timing through intense phrases.',
      ],
      [
        'Sota Asagiri',
        '희미한 숨결과 가느다란 고음이 떠오르는 맑은 테너',
        ['가느다란 고음', '숨결', '맑음', '가벼움'],
        'Pale light tenor with a fine breath edge, slender low notes and a clear floating upper register. Soft lifted onsets and small head-voice transitions keep the line delicate. Use lightly articulated consonants and a faint quick tremor at the ends of long notes, with no heavy chest belt.',
      ],
      [
        'Haruto Kagari',
        '숨 섞인 어택 뒤 둥글고 거친 중음이 남는 허스키 바리톤',
        ['허스키', '둥근 중음', '숨 섞인 어택', '따뜻함'],
        'Middle baritone with an airy husky onset that quickly gathers into a round, grainy core. The lower middle is warm and tactile, while upper vowels stay broad and lightly worn. Connect syllables smoothly, allow a relaxed medium vibrato and retain a soft roughness throughout sustained notes.',
      ],
      [
        'Minato Shigure',
        '좁은 비음과 울먹이는 듯한 고음 초점이 선명한 테너',
        ['좁은 비음', '고음 초점', '섬세한 음 굴림', '선명함'],
        'Focused tenor with a narrow nasal resonance and a gently plaintive upper register. Firm small-vowel attacks, subtle upward catches and measured pitch turns give the line a keen edge. Keep chest weight moderate, use a tight late vibrato and make each high note ring without turning breathy.',
      ],
      [
        'Kei Torikaze',
        '얇은 리드 음색과 빠르고 밝은 발음의 라이트 테너',
        ['얇은 리드 음색', '밝은 발음', '민첩함', '라이트 테너'],
        'Thin reedy tenor with a bright oral resonance and a lightly wiry texture. Quick consonants, clean separated onsets and short straight vowels create nimble articulation. Low notes remain light, high notes narrow into a clear flute-like point, and vibrato is brief and fast rather than broad.',
      ],
      [
        'Shun Hisui',
        '고른 중음과 안정적인 둥근 공명을 가진 서정적 바리톤',
        ['고른 중음', '둥근 공명', '서정적', '부드러운 연결'],
        'Centered lyrical baritone with round, polished middle resonance and even register connections. Balanced gentle onsets, smoothly joined vowels and measured breath support produce long supple phrases. A small steady vibrato and a clean warm upper middle distinguish the voice from gritty chest singers.',
      ],
      [
        'Toma Kasumi',
        '가까운 저중음에 벨벳 같은 숨결이 감기는 로우 바리톤',
        ['가까운 저중음', '벨벳 같은 결', '숨결', '낮은 바리톤'],
        'Soft low baritone with a velvet-covered low middle and a persistent, fine smoky breath texture. Rounded almost whispered entrances retain a quiet pitched body. Use small dynamics, gentle downward inflections and long dark vowels; upper notes stay covered and vibrato remains slow and subtle.',
      ],
      [
        'Ritsu Hoshio',
        '강하고 맑은 고음이 직선적으로 울리는 하이 테너',
        ['강한 고음', '맑은 울림', '직선적', '선명한 어택'],
        'High tenor with a strong clean upper ring and a taut, bright middle. Immediate clear attacks and open forward vowels produce energetic projection without persistent rasp. Sustain high notes straight, then release quickly; use only a tiny terminal vibrato and keep lower phrases lean and articulate.',
      ],
      [
        'Nao Suzugane',
        '어두운 중음에서 열린 고음으로 유연하게 움직이는 소울 테너',
        ['어두운 중음', '열린 고음', '소울', '유연함'],
        'Flexible tenor with a dark rounded middle, a soft grain at low volume and an open resonant upper register. Small scoops and buoyant rhythmic delays lead into gently swelling vowels. Use a supple variable vibrato and occasional chesty accents, preserving smooth transitions and intelligible syllables.',
      ],
      [
        'Kaito Yukidoke',
        '넓고 둥근 저음과 완만한 비브라토가 울리는 베이스 바리톤',
        ['넓은 저음', '둥근 공명', '완만한 비브라토', '베이스 바리톤'],
        'Resonant bass-baritone with spacious rounded lows and a smooth, softly buzzing middle. Broad gentle vowel entrances and unhurried connected lines give the tone room. A slow, medium-width vibrato appears naturally on held notes; retain low-register warmth while keeping the upper middle mellow.',
      ],
    ],
  },
  fr: {
    female: [
      [
        'Lucie Silex',
        '말하듯 이어지는 낮은 흉성과 거친 결의 콘트랄토',
        ['낮은 흉성', '거친 결', '말하듯 부르는 창법', '콘트랄토'],
        'Chest-dark contralto with a gritty low middle and close, speech-connected legato. Dry slightly rough onsets settle into dense vowels with a small oral resonance. Keep phrase endings compact, consonants tactile and vibrato rare; high notes retain the same earthy weight instead of becoming airy.',
      ],
      [
        'Manon Cuivre',
        '두꺼운 중저음과 단단한 발음이 드러나는 구리빛 메조',
        ['두꺼운 중저음', '구리빛', '단단한 발음', '밀도'],
        'Powerful lower mezzo with coppery density and a firm, lightly glottal onset. Pointed front vowels sit above a broad chest foundation, creating a dry, direct middle register. Allow a brassy rise on sustained peaks and a delayed shallow vibrato; keep breath noise scarce and releases decisive.',
      ],
      [
        'Inès Braise',
        '스모키한 중음과 울먹이는 비음이 선명하게 모이는 메조',
        ['스모키', '비음', '좁은 울림', '섬세한 어택'],
        'Smoky mezzo with a narrow nasal focus and a lightly crying upper-middle edge. Gentle compressed starts, small vowel scoops and close phrase connections keep the sound intimate yet pointed. Use tight uneven vibrato on longer notes, a dry textured middle and clear, compact consonants.',
      ],
      [
        'Camille Orage',
        '거친 벨팅과 금속성 상중음이 강하게 울리는 록 메조',
        ['거친 벨팅', '금속성', '강한 상중음', '록'],
        'Rock mezzo with a rough chest-led middle and a sharp metallic ring through the upper mix. Hard-edged onsets and narrow forward vowels produce concentrated intensity. Let held peaks carry controlled vocal grit, then cut off cleanly; use straight tone with only brief forceful vibrato at climaxes.',
      ],
      [
        'Alice Nocturne',
        '어두운 벨벳 결 사이로 미세한 거침이 남는 깊은 알토',
        ['어두운 음색', '벨벳 같은 결', '미세한 거침', '깊은 알토'],
        'Deep alto with velvet-dark resonance and fine stippled rasp inside a stable low-middle core. Cushioned voiced attacks and long rounded vowels produce quiet density. Keep the upper range muted and close, soften consonant edges and use a slow delicate vibrato rather than a breathy fade.',
      ],
      [
        'Léonie Grenat',
        '저음의 두꺼운 흉성과 눌린 상중음이 대비되는 콘트랄토',
        ['두꺼운 흉성', '눌린 상중음', '건조함', '콘트랄토'],
        'Very chest-centered contralto with a dense low register and a slightly pinched, muted upper middle. Begin notes dry and firm, shape rounded vowels narrowly and keep a subtle coarse buzz underneath. Minimal pitch slides and almost no vibrato emphasize the contrast between full lows and compact highs.',
      ],
      [
        'Solène Ronce',
        '목 안쪽의 거친 결과 유연한 음 굴림을 지닌 소울 알토',
        ['거친 목소리', '소울', '유연한 음 굴림', '중음 밀도'],
        'Raw middle alto with a throaty, grain-rich edge and a warm pitched center. Flexible scoops, delayed accents and small irregular vibrato give the line a loose soul inflection. Use slightly caught onsets and textured descending releases, preserving a solid midrange instead of whisper-soft delivery.',
      ],
      [
        'Clara Carmin',
        '저음의 진동감 위로 황동빛 고음이 빛나는 강한 메조',
        ['저음 진동감', '황동빛 고음', '강한 공명', '선명함'],
        'Bright brass-toned mezzo with an audible low chest buzz and an open ringing upper middle. Clean rounded attacks expand quickly into full voiced vowels. Articulate consonants crisply, hold sustained tones with steady pressure and let a modest regular vibrato appear only after the initial clear ring.',
      ],
      [
        'Élise Aube',
        '따뜻하고 깨끗한 중음이 둥글게 이어지는 서정적 메조',
        ['따뜻함', '깨끗한 중음', '둥근 모음', '서정적'],
        'Warm clear lyrical mezzo with softly rounded vowels and an even, open middle register. Balanced flowing onsets and smooth connected phrasing keep the tone relaxed. Let upper notes brighten with a gentle head contribution, using a fine steady vibrato and almost no audible grain or breath noise.',
      ],
      [
        'Nina Brume',
        '가벼운 두성과 희미한 거친 숨결이 퍼지는 소프라노',
        ['가벼운 두성', '공기감', '희미한 거친 결', '부드러움'],
        'Feathery soprano with diffuse head resonance and a faint husky breath texture around the pitch. Soft lifted entries, fine consonants and slender sustained notes create an intimate floating line. Keep the low register light and use a tiny wavering vibrato, avoiding both heavy chest density and hard sparkle.',
      ],
      [
        'Margot Opale',
        '차갑고 단정한 고음과 곧은 음선이 돋보이는 맑은 소프라노',
        ['차가운 고음', '곧은 음선', '맑음', '정확함'],
        'Clear cool soprano with a focused crystalline head ring and a pure, non-airy core. Precise light attacks and straight narrow vowels give the melody a clean outline. Low notes remain small but voiced; use controlled even dynamics and only a short fine vibrato at the ends of held high notes.',
      ],
      [
        'Zoé Rivage',
        '밝은 비음과 작은 트웽이 경쾌하게 튀는 라이트 메조',
        ['밝은 비음', '작은 트웽', '경쾌함', '가벼운 메조'],
        'Adult light mezzo with a compact upper-middle placement, bright nasal color and a playful small twang. Quick clean onsets and elastic syllable timing keep vowels buoyant. Use short precise pitch turns, light chest weight and minimal vibrato; the high register stays pointed, clear and firmly voiced.',
      ],
    ],
    male: [
      [
        'Louis Ardoise',
        '깊고 조밀한 저음에 미세한 크리키 어택이 있는 베이스 바리톤',
        ['깊은 저음', '조밀함', '크리키 어택', '베이스 바리톤'],
        'Deep bass-baritone with compact chest resonance and faint creaky texture at low-note entrances. Dense steady vowels, slow releases and close consonant placement create a grounded tone. Keep breath noise low, vibrato nearly still and the upper middle dark with a subtle slate-like rough edge.',
      ],
      [
        'Rémi Buis',
        '마른 나무 같은 중음과 거친 음 끝의 바리톤',
        ['마른 나무 같은 음색', '거친 음 끝', '드라이', '바리톤'],
        'Dry coarse baritone with a woody middle and percussive phrase endings. Slightly scraped onsets open into narrow, firm vowels with little bloom. Keep consonants distinct, pitch slides small and vibrato sparse; upper notes gain a rough bright rim while the low middle remains blunt and chest-led.',
      ],
      [
        'Maël Orme',
        '조밀한 저음과 잔잔한 진동감을 가진 매끈한 로우 바리톤',
        ['조밀한 저음', '잔잔한 진동감', '매끄러움', '절제'],
        'Dense smooth low baritone with a gentle buzzing chest core and close rounded resonance. Balanced voiced entrances, even vowel pressure and unhurried connected lines keep the sound substantial. Use restrained dynamics and shallow late vibrato; allow a little low-register grain without a breathy or gravelly surface.',
      ],
      [
        'Jules Cobalt',
        '강철 같은 고음과 압축된 어택으로 뻗는 록 테너',
        ['강철 같은 고음', '압축된 어택', '록', '강한 울림'],
        'High tenor with a steel-bright upper mix and a tight energized middle. Slightly compressed attacks launch clear ringing vowels, with a thin rough edge only at high intensity. Keep peaks straight and projected, releases quick and consonants sharp; a brief narrow vibrato may close the longest notes.',
      ],
      [
        'Théo Fumée',
        '중음의 스모키한 결과 느슨한 호흡 연결이 돋보이는 테너',
        ['스모키한 중음', '거친 결', '느슨한 연결', '차분함'],
        'Middle tenor with a smoky, lightly grainy core and relaxed breath-connected phrasing. Soft voiced onsets lead into slightly covered vowels that brighten gently near the top. Use lazy small slides and a loose shallow vibrato, keeping the lower middle tactile and the endings softly rough rather than clear-cut.',
      ],
      [
        'Noé Hiver',
        '맑고 얇은 음색에 작은 숨결이 스치는 라이트 테너',
        ['맑고 얇은 음색', '작은 숨결', '섬세함', '라이트 테너'],
        'Light slender tenor with a clean pale core and a fine breath trace along the edges. Delicate onsets, clear softly touched consonants and easy upper head resonance create a fragile but pitched line. Keep lows lean, avoid chest compression and use a quick very small vibrato on long upper notes.',
      ],
      [
        'Bastien Chêne',
        '넓은 흉성과 둥근 저음이 풍성하게 울리는 베이스',
        ['넓은 흉성', '둥근 저음', '풍성함', '베이스'],
        'Dark resonant bass with broad rounded chest vowels and a roomy, softly textured middle. Gentle full-voiced attacks and slow connected phrases let low notes bloom naturally. Use a measured medium-width vibrato and generous resonance without operatic projection; upper notes stay warm, mellow and open.',
      ],
      [
        'Adrien Mistral',
        '뾰족한 비음과 빠른 자음이 탄력 있게 움직이는 테너',
        ['뾰족한 비음', '빠른 자음', '탄력', '선명함'],
        'Forward tenor with a pointed nasal upper middle and a taut, agile oral resonance. Crisp percussive consonants and springy onsets give syllables quick definition. Use narrow bright vowels, small rhythmic scoops and fast terminal vibrato; keep the lower range light but never whispery.',
      ],
      [
        'Sacha Velours',
        '따뜻한 모음과 고른 호흡으로 부드럽게 감싸는 바리톤',
        ['따뜻한 모음', '고른 호흡', '부드러움', '서정적 바리톤'],
        'Warm lyrical baritone with soft, rounded middle resonance and a smooth satin-like core. Cushioned balanced onsets, carefully connected vowels and even breathing create an inward, gentle delivery. Use a regular modest vibrato, restrained consonants and a clean upper extension with very little grit.',
      ],
      [
        'Elias Safran',
        '흉성의 거친 결과 열린 고음이 유연하게 이어지는 소울 테너',
        ['흉성의 거친 결', '열린 고음', '소울', '유연함'],
        'Chest-connected tenor with warm granular texture in the middle and a smoothly opening upper register. Caressing scoops, delayed phrase accents and gently caught onsets create a flexible soul contour. Vary vibrato width slightly on long vowels and let low notes stay dense while higher notes gain a rounded cry.',
      ],
      [
        'Hugo Quartz',
        '새콤한 비음과 얇은 거친 결이 반짝이는 하이 테너',
        ['날카로운 비음', '얇은 거친 결', '고음', '선명한 울림'],
        'Narrow high tenor with a tart bright resonance, fine rasp and a small sharp nasal point. Quick dry attacks lead to tightly focused high vowels with a clear crystalline ring. Keep the middle wiry, use almost no low chest bloom and finish notes with a fast tiny vibrato or a clean clipped release.',
      ],
      [
        'Arthur Ajonc',
        '마른 비음과 거친 트웽이 강하게 드러나는 미들 바리톤',
        ['마른 비음', '거친 트웽', '단단한 중음', '강한 어택'],
        'Middle baritone with dry nasal twang, a coarse chest edge and a compact woody body. Firm speech-like starts and strongly shaped consonants give the line a blunt rhythmic pulse. Upper accents turn briefly bark-like while remaining pitched; use straight short holds and only sparse shallow vibrato.',
      ],
    ],
  },
};

const LANGUAGE_NAMES = { en: 'English', ja: 'Japanese', fr: 'French' };

function buildProfiles() {
  return Object.entries(VOICES).flatMap(([language, genders]) =>
    Object.entries(genders).flatMap(([gender, rows]) =>
      rows.map(([name, shortDescription, tags, identity], index) => ({
        id: `melodio-global-v1-${language}-${gender === 'female' ? 'f' : 'm'}${String(index + 1).padStart(2, '0')}`,
        name,
        shortDescription,
        gender,
        language,
        stylePrompt: `Solo adult ${gender} voice singing in ${LANGUAGE_NAMES[language]} with natural native pronunciation. ${identity} Close dry vocal, no vocal doubling or choir.`,
        tags: [...tags],
        lyricsPrompt: LYRICS[language][index % LYRICS[language].length],
        bpm: 88,
      })),
    ),
  );
}

module.exports = { buildProfiles };
