import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const {
      prompt: rawPrompt,
      size = '1:1',
      imageType = 'logo',
      channelTitle = '',
      key_name = '',
      count: rawCount = 2,
    } = await request.json()
    if (typeof rawPrompt !== 'string' || !rawPrompt.trim()) {
      return NextResponse.json({ error: '이미지 프롬프트가 필요합니다.' }, { status: 400 })
    }
    const imageCount = Math.min(2, Math.max(1, Number(rawCount) || 1))
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY 환경 변수가 설정되지 않았습니다.' }, { status: 400 })
    }

    // Replace [CHANNEL_NAME] and {CHANNEL_NAME} placeholders with actual channelTitle
    let processedPrompt = rawPrompt
    if (channelTitle) {
      processedPrompt = rawPrompt
        .replace(/\[CHANNEL_NAME\]/g, channelTitle)
        .replace(/\{CHANNEL_NAME\}/g, channelTitle)
    }

    let finalPrompt = processedPrompt
    if (imageType === 'banner') {
      const lowerPrompt = finalPrompt.toLowerCase()
      const isTraditional = lowerPrompt.includes('ink wash') || lowerPrompt.includes('oriental') || lowerPrompt.includes('gukak') || lowerPrompt.includes('traditional') || lowerPrompt.includes('조선') || lowerPrompt.includes('민화') || lowerPrompt.includes('ink')
      
      let styleDisclaimer = ""
      let fadeEffectInstruction = ""

      if (isTraditional) {
        styleDisclaimer = "Ensure no vertical calligraphic boxes, no vertical text frames, no side calligraphy boxes, no borders, and no framing lines are rendered on the left or right edges."
        fadeEffectInstruction = "All visual elements and ink textures must naturally smudge, bleed (번짐), and fade out into the paper background."
      } else {
        styleDisclaimer = "Ensure no artificial borders, no frame lines, and no solid boxes are rendered on the sides."
        fadeEffectInstruction = "All visual elements, neon lights, or digital illustrations must softly fade out with a clean gradient fade, soft ambient blur, or subtle vignetting to blend seamlessly into the plain background, with absolutely NO painterly or ink-smudging textures."
      }

      const layoutInstruction = `
- YouTube Banner Layout Blueprint:
  1. The overall image must be a 16:9 widescreen canvas.
  2. TV Areas (the top 35% and bottom 35% of the canvas height): Must be completely plain, empty, clean, solid light-toned background (such as solid off-white, light cream, or very light gray) with absolutely zero details, objects, characters, or text.
  3. Mobile Safe Zone (the absolute center of the canvas, strictly confined within the middle 45% of the horizontal width and middle 30% of the vertical height): Place the main channel title text '${channelTitle}' and all key visual motifs (such as instruments, primary subjects, and copywriting) here, tightly packed together. The text '${channelTitle}' must be placed exactly in the center of this safe zone and must never exceed this width.
  4. Left & Right Margins (outside the central 45% width): ${fadeEffectInstruction}
  5. Forbidden elements: Absolutely no vertical columns, no calligraphy banners on the sides, no framing border lines, no text stripes, and no complex busy elements near the far left or far right edges. ${styleDisclaimer}
`
      finalPrompt = `${finalPrompt}. ${layoutInstruction}`
    } else if (imageType === 'logo') {
      finalPrompt = `${finalPrompt}, designed as a high-resolution circular profile logo, perfectly centered within the frame, suitable for a YouTube avatar icon. Keep the edges clean and empty of critical details.`
    } else if (imageType === 'thumbnail') {
      // Preset scene prompts may contain old illustration or distorted-camera directions.
      // Establish the photographic requirement first and use those prompts only as scene context.
      finalPrompt = `Mandatory thumbnail visual requirement: Create a premium, natural editorial photograph of a believable real-world scene, as if captured by a professional photographer. This photographic requirement takes precedence over any conflicting style or camera directions in the scene reference below. Use a normal 35–50mm photographic lens, straight natural perspective, realistic proportions, coherent depth, and one continuous scene. When people or musical instruments are present, show anatomically correct hands, credible playing posture, accurately constructed instruments, and physically plausible objects with authentic material textures. Use luminous balanced exposure, clear natural colors, gentle realistic highlights, crisp subject separation, and open breathable composition with visible shadow detail. Preserve the requested musical genre and mood through the real location, subjects, lighting, and color. No illustration, painting, anime, cartoon, 3D render, CGI, surreal imagery, warped instruments, distorted anatomy, fisheye, extreme wide-angle perspective, radial or zoom blur, kaleidoscope, collage, muddy color cast, dim underexposure, crushed blacks, heavy vignette, or dark wash. No text, typography, logos, watermark, letters, or writing whatsoever.

Subject selection: Musical instruments, studio equipment and performers are not required. Represent the preset primarily through concept-appropriate places, landscapes, people, activities and emotional atmosphere. Do not add an instrument or turn every scene into a recording studio simply because audio metadata names an instrument. An instrument may appear only when it naturally belongs to the requested visual concept; if it appears, render it accurately.

Composition and framing: This is one finished preset thumbnail, not a graphic album sleeve, screenshot, mood board, or montage. Use the requested aspect ratio and frame the main subject with comfortable space around it. Keep important faces, hands and meaningful scene details away from the edges so the existing card crop does not cut through them. Establish a readable foreground, middle ground and background through believable camera placement; straight architectural lines and consistent scale should make the scene feel naturally photographed. A still photograph must not visualize video-camera motion with streaks, duplicated subjects or stretched objects.

Genre and concept fidelity: Choose the real setting and focal subject from the supplied visual concept, description and user requirements. Use the musical genre and audio style as emotional context. Distinguish this preset from nearby genres through relevant scene details rather than applying the same anonymous studio, subway or neon background to every image. Sound-design words, instrument names, rhythmic patterns and effects describe the music and do not require corresponding visible objects. Retain the concept's culture, era and emotional character when explicitly given.

Light, color and photographic finish: Respect evening, rainy, smoky or nocturnal concepts when requested while using believable window fill, reflected light or practical fixtures to keep the subject legible. Preserve tonal separation in black clothing and dark equipment rather than flattening them into silhouettes. Daytime concepts should use natural daylight; night concepts should remain recognizable as night. Authentic skin, fabric, wood, metal, glass and instrument surfaces should have real microtexture, subtle imperfections and restrained highlights. Avoid plastic-looking skin, exaggerated bloom, oversaturated neon and excessively soft or muddy processing. Use crisp focus on the focal subject with only plausible optical depth of field.

Scene and musical mood reference (use the subjects, location, genre, and mood; reinterpret any illustration, surreal, or distorted-camera instructions as a natural photograph):
${processedPrompt}

Final visual check: A single genuine-looking editorial photograph with believable geometry, natural light, balanced exposure, and no text or graphical effects.`
    } else if (imageType === 'viral-video-cover') {
      finalPrompt = `${finalPrompt}. Create a premium photorealistic live-action keyframe that looks captured directly from the same video production. Preserve the exact protagonist identity, face, age, hairstyle, wardrobe colors, supporting actor, core prop, location, action, camera lens, and lighting described above. Natural skin texture, realistic hands and anatomy, physically plausible objects, crisp facial focus, cinematic Korean short-form reality cinematography, dramatic but believable lighting. Compose the main subject centrally with enough safe space for a 9:16 vertical thumbnail crop. Absolutely no illustration, no anime, no cartoon, no 3D render, no CGI look, no text, no typography, no logos, no watermark, no letters, and no writing.`
    }

    // ────────────────────────────────────────────────────────────────────────
    // 이미지 생성: gpt-image-2 via OpenAI
    // ────────────────────────────────────────────────────────────────────────
    async function generateSingleImage(promptText: string, sizeOption: string): Promise<string> {
      const sizeParam = sizeOption === '16:9'
        ? imageType === 'thumbnail' ? '1792x1008' : '1792x1024'
        : sizeOption === '9:16'
          ? '1024x1536'
          : '1024x1024'
      const endpointUrl = 'https://api.openai.com/v1/images/generations'

      console.log(`[API/generate-image] gpt-image-2 via OpenAI 호출 (size: ${sizeParam})`)

      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: promptText,
          n: 1,
          size: sizeParam,
          quality: imageType === 'viral-video-cover' ? 'high' : 'auto',
          output_format: 'png',
        })
      })

      if (!res.ok) {
        throw new Error(`gpt-image-2 호출 실패: HTTP ${res.status}`)
      }

      const data = await res.json()
      const b64Data = data.data?.[0]?.b64_json
      const imageUrl = b64Data ? `data:image/png;base64,${b64Data}` : data.data?.[0]?.url

      if (!imageUrl) throw new Error('gpt-image-2 응답에 이미지 데이터가 없습니다.')

      console.log(`[API/generate-image] gpt-image-2 이미지 생성 성공!`)
      return imageUrl
    }

    console.log(`[API/generate-image] ${imageCount}개 이미지 병렬 생성 요청 중...`)
    const generatedImageUrls = await Promise.all(
      Array.from({ length: imageCount }, () => generateSingleImage(finalPrompt, size))
    )

    // Upload to Supabase Storage to get permanent URLs
    let permanentUrls: string[] = []
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      const uploadImage = async (urlStr: string, index: number) => {
        let buffer: Buffer;
        if (urlStr.startsWith('data:image')) {
          const base64Data = urlStr.split(',')[1];
          buffer = Buffer.from(base64Data, 'base64');
        } else {
          const res = await fetch(urlStr);
          const arrayBuffer = await res.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        }

        const fileName = `${channelTitle ? channelTitle.replace(/[^a-zA-Z0-9-]/g, '_') : 'preset'}_${Date.now()}_${index}`;
        const filePath = `thumbnails/${user.id}/${fileName}.png`
        const { error: uploadError } = await supabase.storage
          .from('melodio-assets')
          .upload(filePath, buffer, {
            contentType: 'image/png',
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Supabase upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('melodio-assets')
          .getPublicUrl(filePath);

        return publicUrl;
      }

      permanentUrls = await Promise.all(
        generatedImageUrls.map((imageUrl, index) => uploadImage(imageUrl, index + 1))
      )
      console.log(`[API/generate-image] Permanent URLs generated:`, permanentUrls);

      // If key_name is provided, update the database row in curation_playbooks
      if (key_name && permanentUrls.length > 0) {
        console.log(`[API/generate-image] Updating DB row for key_name: ${key_name} with thumbnail URL...`);
        const { data: pbData, error: pbError } = await supabase
          .from('curation_playbooks')
          .select('metadata')
          .eq('key_name', key_name)
          .maybeSingle();

        if (!pbError && pbData) {
          const updatedMetadata = {
            ...(pbData.metadata || {}),
            thumbnail_url: permanentUrls[0],
            thumbnail_urls: permanentUrls
          };
          const { error: updateError } = await supabase
            .from('curation_playbooks')
            .update({ metadata: updatedMetadata })
            .eq('key_name', key_name);

          if (updateError) {
            console.error(`[API/generate-image] DB Update failed: ${updateError.message}`);
          } else {
            console.log(`[API/generate-image] DB Update succeeded for key_name: ${key_name}`);
          }
        } else if (pbError) {
          console.error(`[API/generate-image] Failed to fetch playbook for update: ${pbError.message}`);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[API/generate-image] Failed to upload to Supabase storage, falling back to raw urls:', message);
      permanentUrls = generatedImageUrls
    }

    return NextResponse.json({
      success: true,
      imageUrls: permanentUrls,
      imageUrl: permanentUrls[0] || '', // 하위 호환성 유지
      blendedPrompt: finalPrompt
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Image generation failed' }, { status: 500 })
  }
}
