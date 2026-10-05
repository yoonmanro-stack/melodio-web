import { NextRequest, NextResponse } from 'next/server'
import {
  buildPresetAnalysisSystemPrompt,
  buildPresetConceptContext,
  buildPresetNameRepairPrompt,
  mergePresetNameRepair,
  normalizePresetConceptInput,
  PresetConceptInputError,
  validatePresetNames,
} from '@/lib/preset-concept-analysis'

export const maxDuration = 90

const errorMessages: Record<string, { missingInput: string; apiFailed: string; invalidName: string }> = {
  ko: { missingInput: '분석할 레퍼런스 이미지, 컨셉명 또는 컨셉 참고 문구가 필요합니다.', apiFailed: '프리셋 분석에 실패했습니다. 다시 시도해 주세요.', invalidName: '짧고 자연스러운 프리셋 이름을 만들지 못했습니다. 다시 시도해 주세요.' },
  en: { missingInput: 'Reference image(s), a concept name or concept reference text required.', apiFailed: 'Preset analysis failed. Please try again.', invalidName: 'Could not create a valid concise preset title. Please try again.' },
  ja: { missingInput: '参照画像、コンセプト名、または参考テキストが必要です。', apiFailed: 'プリセットの分析に失敗しました。もう一度お試しください。', invalidName: '短く自然なプリセット名を作成できませんでした。もう一度お試しください。' },
  es: { missingInput: 'Se requiere una imagen, un nombre de concepto o un texto de referencia.', apiFailed: 'No se pudo analizar el preset. Inténtalo de nuevo.', invalidName: 'No se pudo crear un título breve válido. Inténtalo de nuevo.' },
  fr: { missingInput: 'Une image, un nom de concept ou un texte de référence est requis.', apiFailed: 'L’analyse du preset a échoué. Veuillez réessayer.', invalidName: 'Impossible de créer un titre court valide. Veuillez réessayer.' },
  de: { missingInput: 'Ein Referenzbild, Konzeptname oder Referenztext ist erforderlich.', apiFailed: 'Die Preset-Analyse ist fehlgeschlagen. Bitte erneut versuchen.', invalidName: 'Ein gültiger kurzer Titel konnte nicht erstellt werden. Bitte erneut versuchen.' },
  pt: { missingInput: 'É necessária uma imagem, um nome de conceito ou um texto de referência.', apiFailed: 'A análise do preset falhou. Tente novamente.', invalidName: 'Não foi possível criar um título curto válido. Tente novamente.' },
  zh: { missingInput: '需要参考图片、概念名称或概念参考文本。', apiFailed: '预设分析失败，请重试。', invalidName: '未能生成简短有效的预设名称，请重试。' },
  it: { missingInput: 'È richiesta un’immagine, un nome del concetto o un testo di riferimento.', apiFailed: 'Analisi del preset non riuscita. Riprova.', invalidName: 'Impossibile creare un titolo breve valido. Riprova.' },
  hi: { missingInput: 'संदर्भ चित्र, अवधारणा नाम या संदर्भ पाठ आवश्यक है।', apiFailed: 'प्रीसेट का विश्लेषण विफल हुआ। फिर से प्रयास करें।', invalidName: 'एक मान्य छोटा प्रीसेट शीर्षक नहीं बन सका। फिर से प्रयास करें।' },
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'A JSON object is required.' }, { status: 400 })
    }
    const input = normalizePresetConceptInput(body)
    const images = Array.isArray(body.images) ? body.images.filter((image: unknown) => typeof image === 'string' && image.trim()) : []
    const messages = errorMessages[input.locale]
    if (!images.length && !input.conceptName && !input.conceptReference) {
      return NextResponse.json({ error: messages.missingInput }, { status: 400 })
    }

    const systemPrompt = buildPresetAnalysisSystemPrompt(input.locale)
    const conceptContext = buildPresetConceptContext(input)
    const userText = [
      images.length
        ? 'Analyze the attached image(s) and generate a music and visual preset using the supplied creative requirements and inspiration.'
        : 'Generate a music and visual preset using the supplied creative requirements and inspiration.',
      conceptContext,
    ].filter(Boolean).join('\n\n')
    const userContent = [
      { type: 'text', text: userText },
      ...images.map((image: string) => ({ type: 'image_url', image_url: { url: image } })),
    ]
    const apiKey = process.env.OPENAI_API_KEY
    const MODEL_CHAIN = ['gpt-5.6-sol']
    // Leave room inside the route's 90-second limit for one text-only title repair.
    const deadline = Date.now() + 75_000

    async function attemptVision(keyStr: string, apiUrlStr: string, repairPrompt?: string): Promise<Record<string, unknown> | null> {
      const remainingMs = deadline - Date.now()
      if (remainingMs < 1_000) return null
      for (const model of MODEL_CHAIN) {
        try {
          const response = await fetch(apiUrlStr, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keyStr}` },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: repairPrompt ? `${userText}\n\n${repairPrompt}` : userContent },
              ],
              response_format: { type: 'json_object' },
              reasoning_effort: 'low',
              max_completion_tokens: repairPrompt ? 4096 : 8192,
            }),
            signal: AbortSignal.timeout(Math.min(remainingMs, repairPrompt ? 20_000 : 60_000)),
          })
          if (!response.ok) {
            console.warn(`[API/style-library/analyze-image] Provider HTTP ${response.status}`)
            return null
          }
          const data = await response.json()
          const contentText = data.choices?.[0]?.message?.content
          if (typeof contentText !== 'string' || !contentText.trim()) return null
          const parsed: unknown = JSON.parse(contentText)
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
        } catch (error: unknown) {
          const category = error instanceof SyntaxError ? 'invalid_json' : error instanceof Error && /timeout|abort/iu.test(error.name) ? 'timeout' : 'request_failed'
          console.warn(`[API/style-library/analyze-image] Provider ${category}`)
          return null
        }
      }
      return null
    }

    let parsed = apiKey ? await attemptVision(apiKey, 'https://api.openai.com/v1/chat/completions') : null
    if (!parsed) return NextResponse.json({ error: messages.apiFailed, retryable: true }, { status: 500 })

    let nameIssues = validatePresetNames(parsed)
    if (nameIssues.length && apiKey) {
      const repaired = await attemptVision(apiKey, 'https://api.openai.com/v1/chat/completions', buildPresetNameRepairPrompt(parsed, nameIssues))
      parsed = mergePresetNameRepair(parsed, repaired)
      nameIssues = validatePresetNames(parsed)
    }
    if (nameIssues.length) {
      console.warn(`[API/style-library/analyze-image] Invalid preset titles: ${nameIssues.map(issue => `${issue.field}:${issue.reason}`).join(',')}`)
      return NextResponse.json({ error: messages.invalidName, code: 'invalid_preset_name', retryable: true }, { status: 502 })
    }

    if (input.category) parsed.category = input.category
    console.log('[API/style-library/analyze-image] Preset analysis completed')
    return NextResponse.json({ success: true, preset: parsed })
  } catch (error: unknown) {
    if (error instanceof PresetConceptInputError) {
      return NextResponse.json({ error: error.message, code: 'invalid_concept_reference' }, { status: 400 })
    }
    console.warn('[API/style-library/analyze-image] Request failed')
    return NextResponse.json({ error: 'Preset analysis failed. Please try again.', retryable: true }, { status: 500 })
  }
}
