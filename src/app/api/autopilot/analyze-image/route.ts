import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { images, channelTitle, logoConcept } = await request.json()
    const apiKey = process.env.OPENAI_API_KEY
    const backupKey = process.env.SUNO_API_KEY
    const apiBase = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '')

    if (!images || images.length === 0) {
      return NextResponse.json({ error: '분석할 레퍼런스 이미지가 없습니다.' }, { status: 400 })
    }

    console.log(`[API/analyze-image] 이미지 ${images.length}장 비전 분석 시작 (채널명: ${channelTitle || 'N/A'}, 로고 컨셉: ${logoConcept || 'N/A'})...`)

    let promptInstruction = 'Please analyze the attached reference image(s). Write a highly detailed, creative, and optimized image generation prompt (under 150 words) that describes the style, objects, lighting, color theme, and overall mood of the image(s). Make it suitable for GPT-Image-2 or Midjourney generation. Avoid copyrighted terms or artist names; instead, describe their visual properties. Output ONLY the raw prompt text in English without any markdown backticks, explanations, or JSON formatting.'
    
    if (channelTitle || logoConcept) {
      promptInstruction += ` Additionally, the user is designing this for a YouTube channel named "${channelTitle || ''}" which features a logo concept described as "${logoConcept || ''}". You MUST integrate this branding: explicitly instruct the generator to beautifully center and render the channel title "${channelTitle || ''}" and a graphic emblem representing "${logoConcept || ''}" in the middle safe area of the banner, matching the visual style of the reference image(s).`
    }

    const userContent: any[] = [
      {
        type: 'text',
        text: promptInstruction
      }
    ]

    images.forEach((img: string) => {
      userContent.push({
        type: 'image_url',
        image_url: { url: img }
      })
    })

    const MODEL_CHAIN = ['gpt-5.6-sol', 'gpt-5.5', 'gpt-4o', 'gpt-4o-mini']
    let parsedText: string | null = null
    let responseOk = false

    async function attemptVision(keyStr: string, apiUrlStr: string): Promise<string | null> {
      for (const model of MODEL_CHAIN) {
        try {
          console.log(`[API/analyze-image] Trying model ${model} at ${apiUrlStr}...`)
          const response = await fetch(apiUrlStr, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${keyStr}`
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: 'system',
                  content: 'You are an expert AI vision analyst and image generation prompt designer.'
                },
                {
                  role: 'user',
                  content: userContent
                }
              ],
              max_tokens: 300,
              temperature: 0.7
            })
          })

          if (response.ok) {
            const data = await response.ok ? await response.json() : null
            return data?.choices?.[0]?.message?.content?.trim() || null
          } else {
            const errText = await response.text()
            console.warn(`[API/analyze-image] Model ${model} failed at ${apiUrlStr}:`, errText)
          }
        } catch (err: any) {
          console.error(`[API/analyze-image] Exception with model ${model} at ${apiUrlStr}:`, err.message)
        }
      }
      return null
    }

    // 1순위: 302.ai API 시도
    if (backupKey) {
      console.log('[API/analyze-image] Attempting 302.ai Proxy API call...')
      const backupUrl = `${apiBase}/v1/chat/completions`
      parsedText = await attemptVision(backupKey, backupUrl)
      if (parsedText) responseOk = true
    }

    // 2순위: 공식 OpenAI API 시도
    if (!responseOk && apiKey) {
      console.log('[API/analyze-image] 302.ai failed/missing, falling back to official OpenAI...')
      parsedText = await attemptVision(apiKey, 'https://api.openai.com/v1/chat/completions')
      if (parsedText) responseOk = true
    }

    if (!responseOk || !parsedText) {
      return NextResponse.json({ error: '모든 비전 API 호출에 실패했습니다.' }, { status: 500 })
    }

    console.log('[API/analyze-image] 분석 성공. 생성된 프롬프트:', parsedText)
    return NextResponse.json({ success: true, prompt: parsedText })
  } catch (error: any) {
    console.error('[API/analyze-image] 에러 발생:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
