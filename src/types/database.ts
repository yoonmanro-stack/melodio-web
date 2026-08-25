/**
 * Melodio — Supabase Database 타입
 * supabase gen types 로 자동 생성되기 전 수동 정의
 */

import type {
  AttentionMode,
  DiscoveryConcept,
  EnergyCurve,
  EpisodeStatus,
  ListenerPrimaryPurpose,
  TrackBlueprintStatus,
  TrackRole,
  VocalTolerance,
} from './channel-system'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
          audio_url: string | null
          cover_art_url: string | null
          source_audio_url: string | null
          duration_mode: string | null
          status: string
          is_public: boolean
          is_liked: boolean
          is_stem_extracted: boolean
          stem_vocals_url: string | null
          stem_drums_url: string | null
          stem_bass_url: string | null
          stem_other_url: string | null
          preview_vocals_url: string | null
          preview_drums_url: string | null
          preview_bass_url: string | null
          preview_other_url: string | null
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
          audio_url?: string | null
          cover_art_url?: string | null
          source_audio_url?: string | null
          duration_mode?: string | null
          status?: string
          is_public?: boolean
          is_liked?: boolean
          is_stem_extracted?: boolean
          stem_vocals_url?: string | null
          stem_drums_url?: string | null
          stem_bass_url?: string | null
          stem_other_url?: string | null
          preview_vocals_url?: string | null
          preview_drums_url?: string | null
          preview_bass_url?: string | null
          preview_other_url?: string | null
          license_hash?: string | null
          created_at?: string
          clipping_count?: number | null
          dissonance_score?: number | null
          audio_grade?: string | null
          retry_count?: number | null
        }
        Update: {
          title?: string
          audio_url?: string | null
          cover_art_url?: string | null
          source_audio_url?: string | null
          duration_mode?: string | null
          status?: string
          is_public?: boolean
          is_liked?: boolean
          is_stem_extracted?: boolean
          stem_vocals_url?: string | null
          stem_drums_url?: string | null
          stem_bass_url?: string | null
          stem_other_url?: string | null
          preview_vocals_url?: string | null
          preview_drums_url?: string | null
          preview_bass_url?: string | null
          preview_other_url?: string | null
          license_hash?: string | null
          clipping_count?: number | null
          dissonance_score?: number | null
          audio_grade?: string | null
          retry_count?: number | null
        }
        Relationships: []
      }
      /** 사용자가 감상 목적으로 구성한 비공개 플레이리스트 */
      user_playlists: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string
          updated_at?: string
        }
        Relationships: []
      }
      /** 플레이리스트와 generations 원곡의 순서 있는 연결 */
      user_playlist_items: {
        Row: {
          id: string
          playlist_id: string
          generation_id: string
          position: number
          added_at: string
        }
        Insert: {
          id?: string
          playlist_id: string
          generation_id: string
          position: number
          added_at?: string
        }
        Update: {
          position?: number
        }
        Relationships: []
      }
      channel_blueprints: {
        Row: {
          id: string
          user_id: string
          channel_name: string
          concept_preset_id: string | null
          promise: string
          discovery_concepts: DiscoveryConcept[]
          status: 'draft' | 'active' | 'paused' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          channel_name: string
          concept_preset_id?: string | null
          promise?: string
          discovery_concepts?: DiscoveryConcept[]
          status?: 'draft' | 'active' | 'paused' | 'archived'
          created_at?: string
          updated_at?: string
        }
        Update: {
          channel_name?: string
          concept_preset_id?: string | null
          promise?: string
          discovery_concepts?: DiscoveryConcept[]
          status?: 'draft' | 'active' | 'paused' | 'archived'
          updated_at?: string
        }
        Relationships: []
      }
      channel_dna_versions: {
        Row: {
          id: string
          channel_id: string
          version: number
          identity_dna: Json
          music_dna: Json
          visual_dna: Json
          editorial_dna: Json
          field_locks: Json
          change_summary: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          version: number
          identity_dna?: Json
          music_dna?: Json
          visual_dna?: Json
          editorial_dna?: Json
          field_locks?: Json
          change_summary?: string
          created_by: string
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      listener_intent_profiles: {
        Row: {
          id: string
          channel_id: string
          name: string
          primary_purpose: ListenerPrimaryPurpose
          secondary_purposes: string[]
          discovery_concepts: DiscoveryConcept[]
          listener_persona: string
          activity: string
          environment: string
          dayparts: string[]
          current_state: string
          desired_state: string
          desired_behavior: string
          session_minutes: number
          attention_mode: AttentionMode
          vocal_tolerance: VocalTolerance
          interruption_tolerance: number
          target_energy: number
          target_energy_curve: EnergyCurve
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          name: string
          primary_purpose: ListenerPrimaryPurpose
          secondary_purposes?: string[]
          discovery_concepts?: DiscoveryConcept[]
          listener_persona?: string
          activity?: string
          environment?: string
          dayparts?: string[]
          current_state?: string
          desired_state?: string
          desired_behavior?: string
          session_minutes?: number
          attention_mode?: AttentionMode
          vocal_tolerance?: VocalTolerance
          interruption_tolerance?: number
          target_energy?: number
          target_energy_curve?: EnergyCurve
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          name: string
          primary_purpose: ListenerPrimaryPurpose
          secondary_purposes: string[]
          discovery_concepts: DiscoveryConcept[]
          listener_persona: string
          activity: string
          environment: string
          dayparts: string[]
          current_state: string
          desired_state: string
          desired_behavior: string
          session_minutes: number
          attention_mode: AttentionMode
          vocal_tolerance: VocalTolerance
          interruption_tolerance: number
          target_energy: number
          target_energy_curve: EnergyCurve
          updated_at: string
        }>
        Relationships: []
      }
      channel_episodes: {
        Row: {
          id: string
          channel_id: string
          dna_version_id: string
          listener_intent_profile_id: string
          episode_title: string
          situation: string
          location: string
          daypart: string
          season: string | null
          weather: string | null
          emotional_arc: string
          listener_intent_overrides: Json
          accent_presets: Json
          target_duration_seconds: number
          planned_track_count: number
          vocal_track_percent: number
          status: EpisodeStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          dna_version_id: string
          listener_intent_profile_id: string
          episode_title: string
          situation?: string
          location?: string
          daypart?: string
          season?: string | null
          weather?: string | null
          emotional_arc?: string
          listener_intent_overrides?: Json
          accent_presets?: Json
          target_duration_seconds?: number
          planned_track_count?: number
          vocal_track_percent?: number
          status?: EpisodeStatus
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          episode_title: string
          situation: string
          location: string
          daypart: string
          season: string | null
          weather: string | null
          emotional_arc: string
          listener_intent_overrides: Json
          accent_presets: Json
          target_duration_seconds: number
          planned_track_count: number
          vocal_track_percent: number
          status: EpisodeStatus
          updated_at: string
        }>
        Relationships: []
      }
      track_blueprints: {
        Row: {
          id: string
          episode_id: string
          track_number: number
          song_title: string
          role: TrackRole
          energy: number
          bpm: number
          musical_key: string
          lead_instrument: string
          support_instruments: string[]
          is_instrumental: boolean
          vocal_gender: string | null
          lyric_language: string | null
          lyric_theme: string | null
          narrative_beat: string | null
          arrangement_variation: string
          target_duration_seconds: number
          actual_duration_seconds: number | null
          style_prompt: string | null
          exclude_prompt: string | null
          status: TrackBlueprintStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          episode_id: string
          track_number: number
          song_title: string
          role: TrackRole
          energy: number
          bpm: number
          musical_key?: string
          lead_instrument?: string
          support_instruments?: string[]
          is_instrumental?: boolean
          vocal_gender?: string | null
          lyric_language?: string | null
          lyric_theme?: string | null
          narrative_beat?: string | null
          arrangement_variation?: string
          target_duration_seconds?: number
          actual_duration_seconds?: number | null
          style_prompt?: string | null
          exclude_prompt?: string | null
          status?: TrackBlueprintStatus
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          track_number: number
          song_title: string
          role: TrackRole
          energy: number
          bpm: number
          musical_key: string
          lead_instrument: string
          support_instruments: string[]
          is_instrumental: boolean
          vocal_gender: string | null
          lyric_language: string | null
          lyric_theme: string | null
          narrative_beat: string | null
          arrangement_variation: string
          target_duration_seconds: number
          actual_duration_seconds: number | null
          style_prompt: string | null
          exclude_prompt: string | null
          status: TrackBlueprintStatus
          updated_at: string
        }>
        Relationships: []
      }
      episode_generation_batches: {
        Row: {
          id: string
          episode_id: string
          user_id: string
          prompt_tier: 'compact' | 'studio'
          status: 'compiling' | 'ready' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
          total_blueprints: number
          raw_candidate_count: number
          ready_items: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          episode_id: string
          user_id: string
          prompt_tier: 'compact' | 'studio'
          status?: 'compiling' | 'ready' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
          total_blueprints: number
          raw_candidate_count: number
          ready_items?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          status: 'compiling' | 'ready' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
          ready_items: number
          updated_at: string
        }>
        Relationships: []
      }
      generation_queue_items: {
        Row: {
          id: string
          batch_id: string
          track_blueprint_id: string
          track_number: number
          title: string
          prompt_tier: 'compact' | 'studio'
          style_prompt: string
          exclude_prompt: string
          lyrics_prompt: string
          lyrics_sections: Json
          is_instrumental: boolean
          candidate_count: 2
          engine: 'suno_v5'
          model: string
          status: 'awaiting_lyrics' | 'compiling_lyrics' | 'ready' | 'queued' | 'submitting' | 'generating' | 'awaiting_selection' | 'completed' | 'failed' | 'submission_failed' | 'generation_failed' | 'cancelled'
          generation_id: string | null
          selected_candidate_id: string | null
          submitted_at: string | null
          selected_at: string | null
          content_hash: string
          error_message: string | null
          compiled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          track_blueprint_id: string
          track_number: number
          title: string
          prompt_tier: 'compact' | 'studio'
          style_prompt: string
          exclude_prompt?: string
          lyrics_prompt?: string
          lyrics_sections?: Json
          is_instrumental: boolean
          candidate_count?: 2
          engine?: 'suno_v5'
          model?: string
          status: 'awaiting_lyrics' | 'compiling_lyrics' | 'ready' | 'queued' | 'submitting' | 'generating' | 'awaiting_selection' | 'completed' | 'failed' | 'submission_failed' | 'generation_failed' | 'cancelled'
          generation_id?: string | null
          selected_candidate_id?: string | null
          submitted_at?: string | null
          selected_at?: string | null
          content_hash?: string
          error_message?: string | null
          compiled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          lyrics_prompt: string
          lyrics_sections: Json
          status: 'awaiting_lyrics' | 'compiling_lyrics' | 'ready' | 'queued' | 'submitting' | 'generating' | 'awaiting_selection' | 'completed' | 'failed' | 'submission_failed' | 'generation_failed' | 'cancelled'
          generation_id: string | null
          selected_candidate_id: string | null
          submitted_at: string | null
          selected_at: string | null
          content_hash: string
          error_message: string | null
          compiled_at: string | null
          updated_at: string
        }>
        Relationships: []
      }
      generation_queue_candidates: {
        Row: {
          id: string
          queue_item_id: string
          generation_id: string
          candidate_slot: 'A' | 'B'
          audio_url: string
          duration_seconds: number | null
          audio_grade: string | null
          clipping_count: number | null
          dissonance_score: number | null
          is_recommended: boolean
          created_at: string
        }
        Insert: {
          id?: string
          queue_item_id: string
          generation_id: string
          candidate_slot: 'A' | 'B'
          audio_url: string
          duration_seconds?: number | null
          audio_grade?: string | null
          clipping_count?: number | null
          dissonance_score?: number | null
          is_recommended?: boolean
          created_at?: string
        }
        Update: Partial<{
          audio_url: string
          duration_seconds: number | null
          audio_grade: string | null
          clipping_count: number | null
          dissonance_score: number | null
          is_recommended: boolean
        }>
        Relationships: []
      }
      episode_assemblies: {
        Row: {
          id: string
          episode_id: string
          batch_id: string
          user_id: string
          status: 'draft' | 'queued' | 'assembling' | 'completed' | 'failed' | 'cancelled'
          assembly_mode: 'gapless'
          track_count: number
          total_duration_seconds: number
          tracklist_text: string
          output_audio_url: string | null
          error_message: string | null
          queued_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          episode_id: string
          batch_id: string
          user_id: string
          status?: 'draft' | 'queued' | 'assembling' | 'completed' | 'failed' | 'cancelled'
          assembly_mode?: 'gapless'
          track_count: number
          total_duration_seconds?: number
          tracklist_text?: string
          output_audio_url?: string | null
          error_message?: string | null
          queued_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          status: 'draft' | 'queued' | 'assembling' | 'completed' | 'failed' | 'cancelled'
          total_duration_seconds: number
          tracklist_text: string
          output_audio_url: string | null
          error_message: string | null
          queued_at: string | null
          completed_at: string | null
          updated_at: string
        }>
        Relationships: []
      }
      episode_assembly_items: {
        Row: {
          id: string
          assembly_id: string
          queue_item_id: string
          candidate_id: string
          generation_id: string
          track_number: number
          title: string
          audio_url: string
          duration_seconds: number
          start_seconds: number
          end_seconds: number
          created_at: string
        }
        Insert: {
          id?: string
          assembly_id: string
          queue_item_id: string
          candidate_id: string
          generation_id: string
          track_number: number
          title: string
          audio_url: string
          duration_seconds: number
          start_seconds: number
          end_seconds: number
          created_at?: string
        }
        Update: Partial<{
          duration_seconds: number
          start_seconds: number
          end_seconds: number
          audio_url: string
        }>
        Relationships: []
      }
      episode_publish_packages: {
        Row: {
          id: string
          episode_id: string
          assembly_id: string
          user_id: string
          status: 'draft' | 'ready' | 'published' | 'archived'
          upload_title: string
          description: string
          tracklist_text: string
          tags: Json
          hashtags: Json
          audio_url: string
          cover_prompt: string
          selected_cover_asset_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          episode_id: string
          assembly_id: string
          user_id: string
          status?: 'draft' | 'ready' | 'published' | 'archived'
          upload_title: string
          description: string
          tracklist_text: string
          tags?: Json
          hashtags?: Json
          audio_url: string
          cover_prompt: string
          selected_cover_asset_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          status: 'draft' | 'ready' | 'published' | 'archived'
          upload_title: string
          description: string
          tags: Json
          hashtags: Json
          cover_prompt: string
          selected_cover_asset_id: string | null
          updated_at: string
        }>
        Relationships: []
      }
      episode_cover_assets: {
        Row: {
          id: string
          package_id: string
          user_id: string
          source: 'ai' | 'upload'
          status: 'pending' | 'generating' | 'ready' | 'failed'
          prompt: string
          image_url: string | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          package_id: string
          user_id: string
          source?: 'ai' | 'upload'
          status?: 'pending' | 'generating' | 'ready' | 'failed'
          prompt: string
          image_url?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          status: 'pending' | 'generating' | 'ready' | 'failed'
          prompt: string
          image_url: string | null
          error_message: string | null
          updated_at: string
        }>
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
    Functions: {
      create_channel_system_draft: {
        Args: {
          p_channel: Json
          p_dna: Json
          p_listener: Json
        }
        Returns: Json
      }
      create_channel_dna_version: {
        Args: {
          p_channel_id: string
          p_dna: Json
          p_change_summary?: string
        }
        Returns: Json
      }
      create_channel_episode_blueprint: {
        Args: {
          p_channel_id: string
          p_dna_version_id: string
          p_listener_intent_profile_id: string
          p_episode: Json
          p_tracks: Json
        }
        Returns: Json
      }
      approve_channel_episode_blueprint: {
        Args: {
          p_channel_id: string
          p_episode_id: string
        }
        Returns: Json
      }
      create_episode_generation_queue: {
        Args: {
          p_channel_id: string
          p_episode_id: string
          p_prompt_tier: 'compact' | 'studio'
          p_items: Json
        }
        Returns: Json
      }
      select_generation_queue_master: {
        Args: {
          p_queue_item_id: string
          p_candidate_id: string
        }
        Returns: Json
      }
      create_episode_assembly: {
        Args: { p_channel_id: string; p_episode_id: string }
        Returns: Json
      }
      queue_episode_assembly: {
        Args: { p_assembly_id: string }
        Returns: Json
      }
      is_user_playlist_eligible_generation: {
        Args: { p_generation_id: string }
        Returns: boolean
      }
      add_generation_to_user_playlist: {
        Args: { p_playlist_id: string; p_generation_id: string }
        Returns: Json
      }
      remove_user_playlist_item: {
        Args: { p_playlist_id: string; p_item_id: string }
        Returns: Json
      }
      reorder_user_playlist_items: {
        Args: {
          p_playlist_id: string
          p_item_ids: string[]
          p_expected_updated_at: string
        }
        Returns: Json
      }
    }
    Enums: {
      plan_type: 'free' | 'starter' | 'pro' | 'studio'
      engine_type: 'lyria3' | 'suno_v5' | 'auto'
      track_status: 'pending' | 'processing' | 'done' | 'failed'
    }
  }
}
