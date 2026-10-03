import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import SharedPlayerClient from './SharedPlayerClient'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getServiceSupabase() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase environment variables are missing')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

const AI_COVER_PRESETS = [
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/joseon-hip-hop.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png",
  "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png"
];

const SHOWCASE_STATIC_TRACKS_MAP: Record<string, any> = {
  // Viral & Trend Zone Showcase Tracks
  "viral-omg": { title: "OMG 2.0", genre: "viral trap", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/43/43f0b640703d53eb76f9b4b5df5cb2ebd85ccc795911f53b7a4f7e0286a6408f.mp3", thumbnailUrl: AI_COVER_PRESETS[0] },
  "viral-chidori": { title: "千鳥", genre: "japanese lofi", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/25/2522b6e359794ed01fa8179412f44bc174498cbfecbc367ecdcb754e4c684def.mp3", thumbnailUrl: AI_COVER_PRESETS[1] },
  "viral-money": { title: "Money for my son 💸", genre: "narrative hiphop", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/ce/ce13a7101bd69a7e2c08b420172fee4e0e1bde037959236e45563340a0346a22.mp3", thumbnailUrl: AI_COVER_PRESETS[3] },
  "viral-girlfriend": { title: "Whole Day", genre: "emo rock", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/4a/4a6c654a8c11a0881b1e32e3b4ff70b3106538a1b66c43f316106c822642a5b3.mp3", thumbnailUrl: AI_COVER_PRESETS[0] },
  "viral-fan": { title: "I am your fan", genre: "korean study beat", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/7f/7f90177ce8aca2291db8ad8e204c2f4144a3c48cbcbd6ef8aa3a4d714e67914d.mp3", thumbnailUrl: AI_COVER_PRESETS[2] },
  "viral-react": { title: "Don't react", genre: "dramatic synth pop", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/f9/f92d546702730e7cae1b2781ea74330e84900840118278d753605d0c9ddb36db.mp3", thumbnailUrl: AI_COVER_PRESETS[1] },
  "viral-paycheck": { title: "Paycheck Gone", genre: "lofi hiphop", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/aa/aabbe3a0b0a5dfc865cdd7cb507d3853b84ad7f79347f9a26036de7330ef0c0b.mp3", thumbnailUrl: AI_COVER_PRESETS[2] },
  "viral-ghosted": { title: "Left on Read 👻", genre: "rnb soul", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/fa/fa86b22e7e6a2eeba9501b3c35318653758edfa1c63ced8ae3d8a41abf33c1e2.mp3", thumbnailUrl: AI_COVER_PRESETS[4] },
  "viral-monday": { title: "Monday Alarm Sucks", genre: "heavy metal punk", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/74/749c99145fc43ea14cae4dd06b0729dbfad433f683c5069c8496aaf678ee3b89.mp3", thumbnailUrl: AI_COVER_PRESETS[3] },
  "viral-diet-fail": { title: "Salad is a Lie 🥗", genre: "funky disco pop", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/88/88b4fe879d01d0400c27481dbd7aa18a46d2c0c4df2ac2aaf8e1686fc9d9bbcf.mp3", thumbnailUrl: AI_COVER_PRESETS[6] },
  "viral-wifi": { title: "No Signal Panic", genre: "glitch hop synth", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/22/2275a6c91e243bf4d3a98201935242b522d2ce3770159adb1e1262089d137aa3.mp3", thumbnailUrl: AI_COVER_PRESETS[0] },
  "viral-gym": { title: "Pre-Workout Rage", genre: "cyberpunk gym", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/a2/a20d04cfcdff0a85e933cec5c79cf6ca09da15763810c83ab42b6f97ca565519.mp3", thumbnailUrl: AI_COVER_PRESETS[3] },
  "viral-cooking": { title: "Microwave Gourmet", genre: "lofi satire", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/6f/6f3962b624589acc4591872a5f99bee43ea28ac2d918288287dfe8108f1fb5c9.mp3", thumbnailUrl: AI_COVER_PRESETS[2] },
  "viral-crypto": { title: "Buy the Dip", genre: "hyperpop crash", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/6e/6e68ef637932eb407f7cb7ca3dbaf48388cc0fd4a784b5741a2ebb95e0b24439.mp3", thumbnailUrl: AI_COVER_PRESETS[6] },
  "viral-cat": { title: "Zoomies at 3AM", genre: "bouncy house", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/4a/4a562cbca1b159282175477d9d6b424cf39f905bace093f591008d2110df083b.mp3", thumbnailUrl: AI_COVER_PRESETS[2] },
  "viral-shopping": { title: "Cart Abandoner", genre: "indie pop electro", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/69/691768c11acaaa1e4848ccdc63e0b55f74c08cffbf47b1755325d66061d70e7a.mp3", thumbnailUrl: AI_COVER_PRESETS[6] },
  "viral-coffee": { title: "Liquid Sanity", genre: "chill jazz lofi", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/38/387ff2601f73331f250df6352bf3877f384149de05cb6c2e62e696b0f6c941ac.mp3", thumbnailUrl: AI_COVER_PRESETS[4] },
  "viral-travel": { title: "Gate Delays", genre: "melodic house trance", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/08/086f1a4715f9591625115afa9bab326ffedf8fc193026eaad0797e22ee525e77.mp3", thumbnailUrl: AI_COVER_PRESETS[1] },

  // Style Library Showcase Tracks
  "showcase-lofi": { title: "Cozy Rain Drops", genre: "Lo-Fi", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/25/2522b6e359794ed01fa8179412f44bc174498cbfecbc367ecdcb754e4c684def.mp3", thumbnailUrl: AI_COVER_PRESETS[2] },
  "showcase-synth": { title: "Neon Horizon", genre: "Synthwave", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/43/43f0b640703d53eb76f9b4b5df5cb2ebd85ccc795911f53b7a4f7e0286a6408f.mp3", thumbnailUrl: AI_COVER_PRESETS[1] },
  "showcase-rock": { title: "Thunder Distortion", genre: "Rock", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/4a/4a6c654a8c11a0881b1e32e3b4ff70b3106538a1b66c43f316106c822642a5b3.mp3", thumbnailUrl: AI_COVER_PRESETS[0] },
  "showcase-kpop": { title: "Supernova Pulse", genre: "K-Pop", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/7f/7f90177ce8aca2291db8ad8e204c2f4144a3c48cbcbd6ef8aa3a4d714e67914d.mp3", thumbnailUrl: AI_COVER_PRESETS[1] },
  "showcase-classical": { title: "Serenade of Spring", genre: "Classical", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/f9/f92d546702730e7cae1b2781ea74330e84900840118278d753605d0c9ddb36db.mp3", thumbnailUrl: AI_COVER_PRESETS[5] },
  "showcase-hiphop": { title: "Concrete Jungle", genre: "Hip Hop", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/ce/ce13a7101bd69a7e2c08b420172fee4e0e1bde037959236e45563340a0346a22.mp3", thumbnailUrl: AI_COVER_PRESETS[3] },

  // Prompt-based vocal tone style demos (internal VD IDs are retained)
  "VD-1004": { title: "Aria 보컬 음색 스타일 데모", genre: "보컬 음색 스타일 (프롬프트 기반)", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/25/2522b6e359794ed01fa8179412f44bc174498cbfecbc367ecdcb754e4c684def.mp3", thumbnailUrl: AI_COVER_PRESETS[4] },
  "VD-2001": { title: "Kenji 보컬 음색 스타일 데모", genre: "보컬 음색 스타일 (프롬프트 기반)", audioUrl: "https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/legacy_302/v1/7f/7f90177ce8aca2291db8ad8e204c2f4144a3c48cbcbd6ef8aa3a4d714e67914d.mp3", thumbnailUrl: AI_COVER_PRESETS[1] }
};

async function getGenerationByPrefix(shareId: string) {
  const prefix = shareId.replace('share-', '')
  
  // 1. Check showcase / static tracks map first
  if (SHOWCASE_STATIC_TRACKS_MAP[shareId]) {
    const item = SHOWCASE_STATIC_TRACKS_MAP[shareId]
    return {
      id: shareId,
      title: item.title,
      genre: item.genre,
      audio_url: item.audioUrl,
      cover_art_url: item.thumbnailUrl,
      prompt: `[Hyper-Realistic 24-bit 96kHz, studio master production] ${item.genre} showcase track`,
      created_at: new Date().toISOString(),
      status: 'completed',
      is_public: true
    }
  }
  if (SHOWCASE_STATIC_TRACKS_MAP[prefix]) {
    const item = SHOWCASE_STATIC_TRACKS_MAP[prefix]
    return {
      id: shareId,
      title: item.title,
      genre: item.genre,
      audio_url: item.audioUrl,
      cover_art_url: item.thumbnailUrl,
      prompt: `[Hyper-Realistic 24-bit 96kHz, studio master production] ${item.genre} showcase track`,
      created_at: new Date().toISOString(),
      status: 'completed',
      is_public: true
    }
  }

  // 2. Query Supabase DB generations
  try {
    const supabaseClient = getServiceSupabase()
    const { data, error } = await supabaseClient
      .from('generations')
      .select('*')
      .eq('id', prefix)
      .limit(1)
    
    if (!error && data && data.length > 0) {
      return data[0]
    }
  } catch (err) {
    console.warn('[Vault] Database exact ID search error:', err)
  }

  // 3. Fallback for prefix / partial ID search in Supabase DB
  try {
    if (prefix.length >= 4) {
      const supabaseClient = getServiceSupabase()
      const { data: allData, error: allErr } = await supabaseClient
        .from('generations')
        .select('*')
      
      if (!allErr && allData) {
        const found = allData.find(x => x.id.replace(/-/g, '').startsWith(prefix) || x.id.startsWith(prefix))
        if (found) return found
      }
    }
  } catch (err) {
    console.warn('[Vault] Database prefix search error:', err)
  }

  // An unknown share ID must not masquerade as a completed track or play a
  // retired provider's sample audio.
  return null
}

export async function generateMetadata({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  const generation = await getGenerationByPrefix(shareId)

  const title = generation?.title || 'AI Music'
  let rawCover = generation?.cover_art_url || ''
  
  let coverUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop'
  if (rawCover && rawCover !== 'undefined' && rawCover !== 'null') {
    if (rawCover.startsWith('/')) {
      coverUrl = `https://melodio.app${rawCover}`
    } else if (rawCover.startsWith('http://') || rawCover.startsWith('https://')) {
      coverUrl = rawCover
    }
  }
  
  const encTitle = encodeURIComponent(title)
  const encCover = encodeURIComponent(coverUrl)
  const ogImageUrl = `https://melodio.app/api/og?id=${shareId}&t=${encTitle}&c=${encCover}&v=5`

  return {
    title: `${title} | Melodio Share`,
    description: `Listen to "${title}", created instantly using AI on Melodio.`,
    openGraph: {
      title: `${title} | Melodio`,
      description: `Listen to "${title}", created instantly using AI on Melodio.`,
      url: `https://melodio.app/vault/${shareId}`,
      siteName: 'Melodio',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
          type: 'image/png',
        }
      ],
      type: 'music.song',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Melodio`,
      description: `Listen to "${title}", created instantly using AI on Melodio.`,
      images: [ogImageUrl],
    }
  }
}

export default async function SharedSongPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  const generation = await getGenerationByPrefix(shareId)

  if (!generation) {
    return notFound()
  }

  return <SharedPlayerClient generation={generation} />
}
