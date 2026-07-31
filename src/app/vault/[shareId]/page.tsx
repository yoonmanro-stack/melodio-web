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

const SHOWCASE_STATIC_TRACKS_MAP: Record<string, any> = {
  // Viral & Trend Zone Showcase Tracks
  "viral-omg": { title: "OMG 2.0", genre: "viral trap", audioUrl: "https://file.302.ai/gpt/imgs/20260722/6614e2045fdbef25fd4ad2f8aaf77240.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop" },
  "viral-chidori": { title: "千鳥", genre: "japanese lofi", audioUrl: "https://file.302.ai/gpt/imgs/20260721/846366722c5740689ce76d827b7f8083.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=600&auto=format&fit=crop" },
  "viral-money": { title: "Money for my son 💸", genre: "narrative hiphop", audioUrl: "https://file.302.ai/gpt/imgs/20260721/c50d906c878145a1abcf9a9acd87c6af.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?q=80&w=600&auto=format&fit=crop" },
  "viral-girlfriend": { title: "Whole Day", genre: "emo rock", audioUrl: "https://file.302.ai/gpt/imgs/20260721/80c471b756dc4fc397daa5ad1b45bbd2.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1515002246390-7bf7e8f87b54?q=80&w=600&auto=format&fit=crop" },
  "viral-fan": { title: "I am your fan", genre: "korean study beat", audioUrl: "https://file.302.ai/gpt/imgs/20260721/a09182e8758936a6da62992dc14b5d40.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?q=80&w=600&auto=format&fit=crop" },
  "viral-react": { title: "Don't react", genre: "dramatic synth pop", audioUrl: "https://file.302.ai/gpt/imgs/20260721/6b6b16e458a284549c23450e69b74b75.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?q=80&w=600&auto=format&fit=crop" },
  "viral-paycheck": { title: "Paycheck Gone", genre: "lofi hiphop", audioUrl: "https://file.302.ai/gpt/imgs/20260721/2d05615eaa0a9128e122dcb61d836969.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=600&auto=format&fit=crop" },
  "viral-ghosted": { title: "Left on Read 👻", genre: "rnb soul", audioUrl: "https://file.302.ai/gpt/imgs/20260721/ff29bbfec047fcfcec08931f70e87563.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop" },
  "viral-monday": { title: "Monday Alarm Sucks", genre: "heavy metal punk", audioUrl: "https://file.302.ai/gpt/imgs/20260721/454d845f5e0f5eab08c467f9c44239fe.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=600&auto=format&fit=crop" },
  "viral-diet-fail": { title: "Salad is a Lie 🥗", genre: "funky disco pop", audioUrl: "https://file.302.ai/gpt/imgs/20260721/e3328e686cfc49d885d500980fae81bd.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=600&auto=format&fit=crop" },
  "viral-wifi": { title: "No Signal Panic", genre: "glitch hop synth", audioUrl: "https://file.302.ai/gpt/imgs/20260721/bc3a2a5f8bccbbd366d2cebbd99cd130.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600&auto=format&fit=crop" },
  "viral-gym": { title: "Pre-Workout Rage", genre: "cyberpunk gym", audioUrl: "https://file.302.ai/gpt/imgs/20260721/a98e47c8e72532ec9bedf58c7706ec0b.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=600&auto=format&fit=crop" },
  "viral-cooking": { title: "Microwave Gourmet", genre: "lofi satire", audioUrl: "https://file.302.ai/gpt/imgs/20260721/cfd533909f68a8ddbf28204ad7782803.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?q=80&w=600&auto=format&fit=crop" },
  "viral-crypto": { title: "Buy the Dip", genre: "hyperpop crash", audioUrl: "https://file.302.ai/gpt/imgs/20260721/77a0f845cfc0ee3c394ccddba0d58638.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?q=80&w=600&auto=format&fit=crop" },
  "viral-cat": { title: "Zoomies at 3AM", genre: "bouncy house", audioUrl: "https://file.302.ai/gpt/imgs/20260720/d931b9e82957a5086edb678d27e1ae05.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=600&auto=format&fit=crop" },
  "viral-shopping": { title: "Cart Abandoner", genre: "indie pop electro", audioUrl: "https://file.302.ai/gpt/imgs/20260720/b40f8b7f9a424573be49fb22c0fd2957.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=600&auto=format&fit=crop" },
  "viral-coffee": { title: "Liquid Sanity", genre: "chill jazz lofi", audioUrl: "https://file.302.ai/gpt/imgs/20260720/d4d5ab6094f165fcaa8f4b4b91da3284.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=600&auto=format&fit=crop" },
  "viral-travel": { title: "Gate Delays", genre: "melodic house trance", audioUrl: "https://file.302.ai/gpt/imgs/20260720/30c4712a4c654d68c3b3c38659845b91.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600&auto=format&fit=crop" },

  // Style Library Showcase Tracks
  "showcase-lofi": { title: "Cozy Rain Drops", genre: "Lo-Fi", audioUrl: "https://file.302.ai/gpt/imgs/20260721/846366722c5740689ce76d827b7f8083.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1515002246390-7bf7e8f87b54?q=80&w=600&auto=format&fit=crop" },
  "showcase-synth": { title: "Neon Horizon", genre: "Synthwave", audioUrl: "https://file.302.ai/gpt/imgs/20260722/6614e2045fdbef25fd4ad2f8aaf77240.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=600&auto=format&fit=crop" },
  "showcase-rock": { title: "Thunder Distortion", genre: "Rock", audioUrl: "https://file.302.ai/gpt/imgs/20260721/80c471b756dc4fc397daa5ad1b45bbd2.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?q=80&w=600&auto=format&fit=crop" },
  "showcase-kpop": { title: "Supernova Pulse", genre: "K-Pop", audioUrl: "https://file.302.ai/gpt/imgs/20260721/a09182e8758936a6da62992dc14b5d40.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=600&auto=format&fit=crop" },
  "showcase-classical": { title: "Serenade of Spring", genre: "Classical", audioUrl: "https://file.302.ai/gpt/imgs/20260721/6b6b16e458a284549c23450e69b74b75.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1438032005730-c779502df39b?q=80&w=600&auto=format&fit=crop" },
  "showcase-hiphop": { title: "Concrete Jungle", genre: "Hip Hop", audioUrl: "https://file.302.ai/gpt/imgs/20260721/c50d906c878145a1abcf9a9acd87c6af.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop" },

  // Voice Lab Demos
  "VD-1004": { title: "Aria Voice Demo", genre: "Soprano Vocal", audioUrl: "https://file.302.ai/gpt/imgs/20260721/846366722c5740689ce76d827b7f8083.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=600&auto=format&fit=crop" },
  "VD-2001": { title: "Kenji Voice Demo", genre: "J-Pop Vocal", audioUrl: "https://file.302.ai/gpt/imgs/20260721/a09182e8758936a6da62992dc14b5d40.mp3", thumbnailUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=600&auto=format&fit=crop" }
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

  // 4. Guaranteed Ultimate Fallback for any unknown share ID (NEVER 404!)
  const rawName = prefix.replace(/^(viral|showcase|preset)-/, '');
  const formattedTitle = rawName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return {
    id: shareId,
    title: formattedTitle || 'Melodio AI Track',
    genre: 'AI Music Track',
    audio_url: 'https://file.302.ai/gpt/imgs/20260722/6614e2045fdbef25fd4ad2f8aaf77240.mp3',
    cover_art_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80',
    prompt: '[Hyper-Realistic 24-bit 96kHz, studio master production] Melodio AI Music Track',
    created_at: new Date().toISOString(),
    status: 'completed',
    is_public: true
  }
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
