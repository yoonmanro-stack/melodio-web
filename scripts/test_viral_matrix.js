import { VIRAL_CATEGORY_MATRIX, getCategoryMatrix } from '../src/lib/vle/viralCategoryMatrix';

const expectedCategories = [
  'drama', 'pet', 'relationship', 'human',
  'trend', 'challenge', 'brand', 'history',
  'parenting', 'food_diet', 'horror_mystery', 'ai_future'
];

console.log('=== VIRAL CATEGORY MATRIX E2E TEST ===');
let pass = true;

for (const cat of expectedCategories) {
  const entry = getCategoryMatrix(cat);
  if (!entry || entry.id !== cat) {
    console.error(`[FAIL] Category ${cat} mismatch or missing!`);
    pass = false;
  } else {
    console.log(`[PASS] ${cat} (${entry.name}): Brief Title="${entry.fewShotBrief.title.slice(0, 25)}...", Protagonist="${entry.videoDirective.protagonist.slice(0, 30)}..."`);
  }
}

if (pass) {
  console.log('\n✅ All 12 categories verified successfully!');
} else {
  console.error('\n❌ Verification failed!');
  process.exit(1);
}
