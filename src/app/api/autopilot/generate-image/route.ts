import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
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
    // 이미지 엔진: gpt-image-2 via 302.ai (단일 엔진 — 2026-07-17 통합)
    const sunoApiKey = process.env.SUNO_API_KEY
    const sunoApiUrl = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '')
    if (!sunoApiKey) {
      return NextResponse.json({ error: 'SUNO_API_KEY 환경 변수가 설정되지 않았습니다.' }, { status: 400 })
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
      finalPrompt = `${finalPrompt}. Clean, cinematic, high-fidelity atmospheric aesthetic illustration. Crucially, there must be NO text, NO typography, NO logos, NO watermark, NO letters, and NO writing whatsoever on the image.`
    } else if (imageType === 'viral-video-cover') {
      finalPrompt = `${finalPrompt}. Create a premium photorealistic live-action keyframe that looks captured directly from the same video production. Preserve the exact protagonist identity, face, age, hairstyle, wardrobe colors, supporting actor, core prop, location, action, camera lens, and lighting described above. Natural skin texture, realistic hands and anatomy, physically plausible objects, crisp facial focus, cinematic Korean short-form reality cinematography, dramatic but believable lighting. Compose the main subject centrally with enough safe space for a 9:16 vertical thumbnail crop. Absolutely no illustration, no anime, no cartoon, no 3D render, no CGI look, no text, no typography, no logos, no watermark, no letters, and no writing.`
    }

    // ────────────────────────────────────────────────────────────────────────
    // 이미지 생성: gpt-image-2 via 302.ai (단일 엔진)
    // ────────────────────────────────────────────────────────────────────────
    async function generateSingleImage(promptText: string, sizeOption: string): Promise<string> {
      const sizeParam = sizeOption === '16:9'
        ? '1792x1024'
        : sizeOption === '9:16'
          ? '1024x1536'
          : '1024x1024'
      const endpointUrl = `${sunoApiUrl}/v1/images/generations`

      console.log(`[API/generate-image] gpt-image-2 via 302.ai 호출 (size: ${sizeParam})`)

      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sunoApiKey}`
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
        const errorText = await res.text()
        throw new Error(`gpt-image-2 호출 실패: ${errorText}`)
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
        const filePath = `thumbnails/${fileName}.png`
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
