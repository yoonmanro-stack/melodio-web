/**
 * Melodio — Supabase Database 타입
 * supabase gen types 로 자동 생성되기 전 수동 정의
 */

export type Database = {
  public: {
    Tables: {
      /** 사용자 프로필 (auth.users 확장) */
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          avatar_url: string | null
          plan: 'free' | 'starter' | 'pro' | 'studio'
          credits_remaining: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          avatar_url?: string | null
          plan?: 'free' | 'starter' | 'pro' | 'studio'
          credits_remaining?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          display_name?: string | null
          avatar_url?: string | null
          plan?: 'free' | 'starter' | 'pro' | 'studio'
          credits_remaining?: number
          updated_at?: string
        }
        Relationships: []
      }
      /** 프롬프트 히스토리 */
      prompt_history: {
        Row: {
          id: string
          user_id: string
          style_prompt: string
          lyrics_prompt: string | null
          engine: 'lyria3' | 'suno_v5' | 'auto'
          is_instrumental: boolean
          selections: Record<string, string[]>
          preset_id: string | null
          is_favorite: boolean
          title: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          style_prompt: string
          lyrics_prompt?: string | null
          engine?: 'lyria3' | 'suno_v5' | 'auto'
          is_instrumental?: boolean
          selections?: Record<string, string[]>
          preset_id?: string | null
          is_favorite?: boolean
          title?: string | null
          created_at?: string
        }
        Update: {
          is_favorite?: boolean
          title?: string | null
        }
        Relationships: []
      }
      /** 생성된 트랙 */
      generated_tracks: {
        Row: {
          id: string
          user_id: string
          prompt_id: string
          title: string
          audio_url: string
          cover_art_url: string | null
          duration: number
          engine: 'lyria3' | 'suno_v5'
          style_prompt: string
          lyrics_prompt: string | null
          status: 'pending' | 'processing' | 'done' | 'failed'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          prompt_id: string
          title: string
          audio_url?: string
          cover_art_url?: string | null
          duration?: number
          engine: 'lyria3' | 'suno_v5'
          style_prompt: string
          lyrics_prompt?: string | null
          status?: 'pending' | 'processing' | 'done' | 'failed'
          created_at?: string
        }
        Update: {
          title?: string
          audio_url?: string
          cover_art_url?: string | null
          duration?: number
          status?: 'pending' | 'processing' | 'done' | 'failed'
        }
        Relationships: []
      }
      /** 실제 음악 생성 기록 (generations) */
      generations: {
        Row: {
          id: string
          user_id: string | null
          title: string
          source_audio_url: string | null
          status: string
          is_liked: boolean
          is_stem_extracted: boolean
          stem_vocals_url: string | null
          stem_drums_url: string | null
          stem_bass_url: string | null
          stem_other_url: string | null
          license_hash: string | null
          created_at: string
          clipping_count: number | null
          dissonance_score: number | null
          audio_grade: string | null
          retry_count: number | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          title: string
          source_audio_url?: string | null
          status?: string
          is_liked?: boolean
          is_stem_extracted?: boolean
          stem_vocals_url?: string | null
          stem_drums_url?: string | null
          stem_bass_url?: string | null
          stem_other_url?: string | null
          license_hash?: string | null
          created_at?: string
          clipping_count?: number | null
          dissonance_score?: number | null
          audio_grade?: string | null
          retry_count?: number | null
        }
        Update: {
          title?: string
          status?: string
          is_liked?: boolean
          is_stem_extracted?: boolean
          stem_vocals_url?: string | null
          stem_drums_url?: string | null
          stem_bass_url?: string | null
          stem_other_url?: string | null
          license_hash?: string | null
          clipping_count?: number | null
          dissonance_score?: number | null
          audio_grade?: string | null
          retry_count?: number | null
        }
        Relationships: []
      }
      video_assets: {
        Row: {
          id: string
          user_id: string
          prompt: string
          video_url: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          prompt: string
          video_url?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          prompt?: string
          video_url?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      plan_type: 'free' | 'starter' | 'pro' | 'studio'
      engine_type: 'lyria3' | 'suno_v5' | 'auto'
      track_status: 'pending' | 'processing' | 'done' | 'failed'
    }
  }
}
