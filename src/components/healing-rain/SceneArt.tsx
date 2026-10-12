import Image from 'next/image';
import { recipes, type SceneId } from '@/lib/healing-rain/recipes';

// Representative artwork stays fixed while settings change; it is not a live generation preview.
export function SceneArt({ scene }: {scene:SceneId;variant?:number}) {
 const label=recipes.find(recipe=>recipe.id===scene)?.name || scene;
 return <Image src={`/healing-rain/recipes/${scene}-v1.webp`} unoptimized loading="eager" width={1672} height={941} sizes="(max-width: 800px) 100vw, (max-width: 1200px) 45vw, 650px" alt={`${label} · AI 생성 실사 스타일 대표 이미지`} className="rain-art" />;
}
