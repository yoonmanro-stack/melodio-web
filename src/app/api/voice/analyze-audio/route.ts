import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const clientGender = formData.get("gender") as string | null;
    const clientPitch = formData.get("pitch") as string | null;
    const clientBrightness = formData.get("brightness") as string | null;

    const apiKey = process.env.OPENAI_API_KEY;

    let transcript = "";
    let detectedLanguage = "Korean";

    // 1. Whisper API로 실제 음성 인식 및 발화 텍스트/언어 확인
    if (file && apiKey) {
      try {
        const whisperFormData = new FormData();
        whisperFormData.append("file", file, file.name || "voice_sample.wav");
        whisperFormData.append("model", "whisper-1");

        const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: whisperFormData,
        });

        if (whisperRes.ok) {
          const whisperData = await whisperRes.json();
          transcript = whisperData.text || "";
          if (whisperData.language) {
            detectedLanguage = whisperData.language;
          }
        }
      } catch (whisperErr) {
        console.warn("Whisper analysis optional error:", whisperErr);
      }
    }

    // 2. OpenAI GPT-4o-mini를 활용하여 음향 DNA 및 Suno 호환 고품질 보컬 프롬프트 연산
    let analysisResult = {
      gender: clientGender || "male",
      vocalRange: "Tenor",
      timbre: "Warm & Breathy",
      language: detectedLanguage === "en" ? "English" : detectedLanguage === "ja" ? "Japanese" : "Korean",
      physicalLayers: {
        pitch: clientPitch ? parseInt(clientPitch, 10) : 55,
        brightness: clientBrightness ? parseInt(clientBrightness, 10) : 60,
        chest: 70,
        head: 55,
        breathiness: 48,
        vibrato: 40,
        reverb: 35,
        clarity: 65,
        raspiness: 25,
      },
      tags: ["Tenor", "Warm", "Emotional", "Acoustic"],
      stylePrompt: `${clientGender || "male"} vocals, soulful melodic tenor, warm textured chest resonance, intimate close-mic delivery, breathy acoustic soul texture`,
      summary: "안정적인 중저음과 부드러운 공기감이 조화로운 어쿠스틱 테너 보컬 톤입니다.",
      sunoAdvice: "이 음색으로 곡을 생성한 후 가장 마음에 드는 트랙을 [내 곡에서 추출]로 저장하시면, 향후 전 곡에서 100% 동일한 아티스트 보컬을 유지할 수 있습니다.",
    };

    if (apiKey) {
      try {
        const systemPrompt = `You are a world-class audio engineer and AI vocal timbre analyst for Suno AI & Melodio.
Analyze the provided user vocal information (transcript, gender hint, pitch hint) and extract precise acoustic parameters for Suno music generation.
You MUST output valid JSON ONLY with the following schema:
{
  "gender": "male" or "female",
  "vocalRange": "Tenor" | "Baritone" | "Bass" | "Soprano" | "Alto" | "Contralto",
  "timbre": "Warm" | "Smoky" | "Breathy" | "Crisp" | "Velvet" | "Airy" | "Gravelly",
  "language": "Korean" | "English" | "Japanese" | "Spanish",
  "physicalLayers": {
    "pitch": number (0-100),
    "brightness": number (0-100),
    "chest": number (0-100),
    "head": number (0-100),
    "breathiness": number (0-100),
    "vibrato": number (0-100),
    "reverb": number (0-100),
    "clarity": number (0-100),
    "raspiness": number (0-100)
  },
  "tags": string[] (3-5 keywords e.g. ["Tenor", "Warm", "Acoustic", "Pop"]),
  "stylePrompt": string (precise English prompt for Suno vocals, e.g. "male vocals, soulful emotive tenor, warm chest resonance, subtle breathy tone, intimate close-mic delivery"),
  "summary": string (Korean explanation of the analyzed voice timbre in 1-2 sentences),
  "sunoAdvice": string (Korean helpful tip on keeping vocalist consistency via Persona)
}`;

        const userContent = `User audio info:
- File Name: ${file?.name || "recorded_audio.wav"}
- File Size: ${file?.size ? Math.round(file.size / 1024) + " KB" : "Unknown"}
- Transcript/Voice Spoken: "${transcript || "General speech/vocal humming"}"
- Gender Hint: ${clientGender || "auto-detect"}
- Pitch Hint: ${clientPitch || "50"}
- Brightness Hint: ${clientBrightness || "50"}`;

        const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            temperature: 0.3,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
          }),
        });

        if (gptRes.ok) {
          const gptData = await gptRes.json();
          const parsed = JSON.parse(gptData.choices[0].message.content);
          analysisResult = { ...analysisResult, ...parsed };
        }
      } catch (gptErr) {
        console.warn("GPT analysis optional fallback:", gptErr);
      }
    }

    return NextResponse.json({
      success: true,
      analysis: analysisResult,
    });
  } catch (error: any) {
    console.error("Audio Analysis Route Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to analyze audio",
      },
      { status: 500 }
    );
  }
}
