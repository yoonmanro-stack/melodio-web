import { compileRecipe, parseRecipe } from '@/lib/healing-rain/recipes';

// Pure recipe compilation: no credentials, provider calls or shared persistent state.
export async function POST(request: Request) {
 const body = await request.text();
 if (body.length > 6000) return Response.json({error:'요청이 너무 큽니다.'},{status:413});
 try {
  const input=parseRecipe(JSON.parse(body));
  return Response.json({plan:compileRecipe(input,crypto.randomUUID(),new Date().toISOString())});
 } catch(error) {
  return Response.json({error:error instanceof SyntaxError?'올바른 JSON 설정이 필요합니다.':error instanceof Error?error.message:'설정을 확인해 주세요.'},{status:400});
 }
}
