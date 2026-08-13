// melodio-web/scripts/check-category-specs.js
//
// 카테고리 스펙 자체 검사기 — `npm run check:specs`
//
// ── 왜 필요한가 ────────────────────────────────────────────────────────────
// goldenExample 은 LLM 이 그대로 흉내내는 기준선이다. 여기 한 줄이 규격을 넘으면
// 생성물도 전부 넘친다. 실제로 2026-08-09 에 훅 줄당 상한을 7 → 6 으로 내렸을 때
// 댕냥이 골든 예시가 규격 위반 상태로 남아 있었고, 그대로 뒀다면 모든 생성물이
// 상한을 넘겼을 것이다.
//
// 카테고리를 11개 더 이관하면 손으로 쓴 골든 예시가 12개가 된다. 규격을 한 번
// 조일 때마다 12개를 눈으로 검사하는 것은 불가능하다. 그래서 기계가 본다.
//
// ── 왜 tsc 를 거치는가 ─────────────────────────────────────────────────────
// 이 저장소에는 테스트 러너도 TS 러너(tsx/ts-node)도 설치돼 있지 않다. 다행히
// 두 스펙 파일은 외부 의존성이 없는 순수 모듈이라, 로컬 typescript 로 임시
// 디렉터리에 트랜스파일한 뒤 require 하면 된다. 의존성을 추가하지 않기 위한 선택이다.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WEB_ROOT = path.resolve(__dirname, '..');
const TSC = path.join(WEB_ROOT, 'node_modules', '.bin', 'tsc');
const SOURCES = [
  'src/lib/vle/viralSongSpec.ts',
  'src/lib/vle/viralCategorySpec.ts',
];

function compileSpecs() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'melodio-spec-check-'));
  execFileSync(
    TSC,
    [...SOURCES, '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: WEB_ROOT, stdio: 'inherit' }
  );
  return outDir;
}

/** 카테고리 하나를 검사하고 문제 목록을 돌려준다. */
function checkCategory(id, spec, songSpec) {
  const problems = [];
  const golden = spec.goldenExample && spec.goldenExample.lyricsStructure;

  if (!golden) {
    return [`goldenExample.lyricsStructure 가 없다`];
  }

  // 1) 골든 예시가 구조 계약을 통과하는가 — 이 검사가 이 스크립트의 존재 이유다.
  const v = songSpec.validateStructure(golden, spec.contentRule);
  v.issues.forEach((issue) => problems.push(`골든 예시: ${issue}`));

  // 2) 총량이 범위 한가운데 있는가.
  //    상한/하한에 딱 붙은 예시는 모델이 흉내내는 순간 넘거나 모자란다.
  //    하한 근처면 Suno 가 남는 자리를 반주로 메워 곡이 오히려 늘어진다(실측 80음절 → 45초).
  const { sungSyllablesMin: lo, sungSyllablesMax: hi } = songSpec.VIRAL_SONG_SPEC;
  const margin = Math.round((hi - lo) * 0.15);
  if (v.sungSyllables < lo + margin || v.sungSyllables > hi - margin) {
    problems.push(
      `골든 예시 총량 ${v.sungSyllables}음절(≈${v.estimatedSeconds}초)이 범위 ${lo}~${hi} 의 가장자리다 — ` +
        `${lo + margin}~${hi - margin} 안으로 옮겨라. 모델은 예시를 흉내내므로 가장자리 예시는 곧 위반 생성물이 된다`
    );
  }

  // 3) 강제 절삭이 걸리면 안 된다. 골든 예시는 자를 필요가 없어야 정상이다.
  const { actions } = songSpec.enforceStructureBudget(golden);
  actions.forEach((a) => problems.push(`골든 예시가 예산 절삭 대상이다: ${a}`));

  // 4) 렌더링 결과에 길이·템포 메타 태그가 새지 않는가.
  //    (과거 버그: [Ultra Short 20s ...] 가 가사 첫 줄로 출력돼 Suno 가 그것을 노래했다.)
  const rendered = songSpec.formatLyricsToSuno(golden);
  if (rendered !== songSpec.stripLeakedMetaTags(rendered)) {
    problems.push('렌더링된 가사에 길이/템포 메타 태그가 섞여 있다');
  }
  if (!rendered.includes('[End]')) {
    problems.push('렌더링된 가사에 [End] 종결 마커가 없다 — Suno 가 반주 아웃트로를 덧붙여 곡이 늘어진다');
  }

  // 5) 영상 변형 축이 실제로 조합을 만들어내는가.
  //    축 하나가 비어 있거나 항목이 1개면 그 축은 고정값이나 마찬가지다.
  const axes = spec.visualGuide && spec.visualGuide.variationAxes;
  if (axes) {
    for (const [name, options] of Object.entries(axes)) {
      if (!Array.isArray(options) || options.length < 2) {
        problems.push(`variationAxes.${name} 항목이 ${(options || []).length}개 — 2개 미만이면 고정값과 같다`);
      }
    }
  }

  // 6) 주인공 후보에 tag 가 있으면, tagHints 의 모든 태그에 최소 1명은 있어야 한다.
  //    없으면 pickProtagonistV2 가 전체 풀로 폴백해 강아지 노래에 고양이가 나온다.
  const guide = spec.visualGuide || {};
  if (guide.tagHints) {
    for (const tag of Object.keys(guide.tagHints)) {
      const count = (guide.protagonistVariants || []).filter((p) => p.tag === tag).length;
      if (count === 0) {
        problems.push(`tagHints 에 "${tag}" 가 있는데 그 태그를 가진 protagonistVariants 가 없다`);
      }
    }
  }

  return problems;
}

function main() {
  let outDir;
  try {
    outDir = compileSpecs();
  } catch {
    console.error('\n❌ 스펙 파일 트랜스파일 실패 — 위 tsc 오류를 먼저 고쳐라.');
    process.exit(1);
  }

  const songSpec = require(path.join(outDir, 'viralSongSpec.js'));
  const { VIRAL_CATEGORY_SPECS } = require(path.join(outDir, 'viralCategorySpec.js'));
  const s = songSpec.VIRAL_SONG_SPEC;

  console.log(
    `\n규격: ${s.targetSecondsMin}~${s.targetSecondsMax}초 / ` +
      `${s.sungSyllablesMin}~${s.sungSyllablesMax}음절 (목표 ${s.sungSyllablesTarget})\n`
  );

  const entries = Object.entries(VIRAL_CATEGORY_SPECS);
  if (entries.length === 0) {
    console.error('❌ 등록된 카테고리가 없다.');
    process.exit(1);
  }

  let failed = 0;
  for (const [id, spec] of entries) {
    const problems = checkCategory(id, spec, songSpec);
    const golden = spec.goldenExample && spec.goldenExample.lyricsStructure;
    const v = golden ? songSpec.validateStructure(golden, spec.contentRule) : null;
    const stat = v ? `${v.sungSyllables}음절 ≈ ${v.estimatedSeconds}초` : '검사 불가';

    if (problems.length === 0) {
      console.log(`  ✅ ${id.padEnd(16)} ${spec.name}  (${stat})`);
    } else {
      failed++;
      console.log(`  ❌ ${id.padEnd(16)} ${spec.name}  (${stat})`);
      problems.forEach((p) => console.log(`       · ${p}`));
    }
  }

  fs.rmSync(outDir, { recursive: true, force: true });

  console.log(
    `\n카테고리 ${entries.length}개 중 ${entries.length - failed}개 통과, ${failed}개 실패.\n`
  );
  if (failed > 0) {
    console.error(
      '골든 예시는 LLM 이 그대로 흉내내는 기준선이다. 여기가 규격을 넘으면 생성물도 전부 넘친다.\n' +
        '예시를 고치거나, 규격이 비현실적이라면 VIRAL_PART_SPECS 쪽을 조정하라.\n'
    );
    process.exit(1);
  }
}

main();
