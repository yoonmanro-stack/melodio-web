// src/lib/db/knowledge.ts
// Client helper to query curation playbooks and Music Wiki from Supabase

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export interface CurationPlaybook {
  id: string
  category: string
  key_name: string
  title: string
  content: string
  metadata: {
    bpm_range?: string
    suno_tags?: string
    exclude_tags?: string
    instruments?: string
    moods?: string
    [key: string]: any
  }
  created_at: string
  updated_at: string
}

/**
 * Fetch a single curation playbook by its unique key_name
 */
export async function getPlaybookByKey(keyName: string): Promise<CurationPlaybook | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[KnowledgeDB] Supabase URL or Service Role Key missing in environment.')
    return null
  }

  try {
    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey)
    const { data, error } = await supabase
      .from('curation_playbooks')
      .select('*')
      .eq('key_name', keyName)
      .maybeSingle()

    if (error) {
      console.error(`[KnowledgeDB] Error fetching playbook for ${keyName}:`, error.message)
      return null
    }
    return data as CurationPlaybook
  } catch (err) {
    console.error(`[KnowledgeDB] Exception in getPlaybookByKey:`, err)
    return null
  }
}

/**
 * Searches and returns curation playbooks matching keywords within a user-provided prompt/vibe.
 * E.g., if the user prompt is "nostalgic liquid d&b empty mall", it matches 'mallsoft' or 'dead-mall-nostalgia'
 */
export async function matchPlaybooksByPrompt(prompt: string): Promise<CurationPlaybook[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !serviceRoleKey || !prompt) {
    return []
  }

  try {
    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey)
    const cleanStr = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
    const cleanPrompt = cleanStr(prompt)

    const { data: playbooks, error } = await supabase
      .from('curation_playbooks')
      .select('*')

    if (error) {
      console.error('[KnowledgeDB] Error fetching playbooks:', error.message)
      return []
    }

    const scored = (playbooks || []).map((pb: any) => {
      const cleanKey = cleanStr(pb.key_name)
      const cleanTitle = cleanStr(pb.title)
      const sunoTags = (pb.metadata?.suno_tags || '').toLowerCase()
      
      let score = 0
      
      // 1. Exact and substring matches
      if (cleanPrompt === cleanKey || cleanPrompt === cleanTitle) {
        score += 1000
      } else {
        if (cleanPrompt.includes(cleanKey)) score += 300
        if (cleanKey.includes(cleanPrompt)) score += 200
        if (cleanPrompt.includes(cleanTitle)) score += 300
        if (cleanTitle.includes(cleanPrompt)) score += 200
      }
      
      // 2. Tokenized matching
      const promptTokens = prompt.toLowerCase().split(/[\s,\-\(\)\{\}\[\]\_\/]+/).filter(t => t.length >= 2)
      for (const token of promptTokens) {
        const cleanToken = cleanStr(token)
        if (cleanToken.length >= 2) {
          if (cleanTitle.includes(cleanToken)) score += 50
          if (cleanKey.includes(cleanToken)) score += 50
        }
      }

      // 3. Suno tags matching
      const tagsList = sunoTags.split(',').map((t: string) => cleanStr(t)).filter((t: string) => t.length > 2)
      for (const tag of tagsList) {
        if (cleanPrompt.includes(tag)) score += 20
        if (tag.includes(cleanPrompt)) score += 10
      }

      return { pb, score }
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)

    const matched = scored.map(item => item.pb)

    return matched as CurationPlaybook[]
  } catch (err) {
    console.error(`[KnowledgeDB] Exception in matchPlaybooksByPrompt:`, err)
    return []
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OBSIDIAN STORY EPISODES DB (로컬 에피소드 스토리 노드 RAG)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface StoryEpisodeNode {
  id: string
  title: string
  category: string
  tags: string[]
  protagonist: string
  antagonist: string
  emotionalArc: string
  summary: string
  punchline: string
  visualPrompt: string
  rawContent: string
}

/**
 * 로컬 옵시디언 스토리 DB (knowledge/episodes) 노드 전체 로드
 */
export function getAllEpisodes(): StoryEpisodeNode[] {
  try {
    const fs = require('fs')
    const path = require('path')
    
    // 가능 경로 탐색 (melodio-web/knowledge/episodes 또는 knowledge/episodes)
    let baseDir = path.join(process.cwd(), 'knowledge/episodes')
    if (!fs.existsSync(baseDir)) {
      baseDir = path.join(process.cwd(), '../knowledge/episodes')
    }
    if (!fs.existsSync(baseDir)) {
      return []
    }

    const episodes: StoryEpisodeNode[] = []
    const categories = fs.readdirSync(baseDir)

    for (const cat of categories) {
      const catPath = path.join(baseDir, cat)
      if (fs.statSync(catPath).isDirectory()) {
        const files = fs.readdirSync(catPath).filter((f: string) => f.endsWith('.md'))
        for (const file of files) {
          const filePath = path.join(catPath, file)
          const content = fs.readFileSync(filePath, 'utf-8')
          
          // 파싱 YAML Frontmatter & Sections
          const idMatch = content.match(/id:\s*"([^"]+)"/)
          const titleMatch = content.match(/title:\s*"([^"]+)"/)
          const categoryMatch = content.match(/category:\s*"([^"]+)"/)
          const tagsMatch = content.match(/tags:\s*(\[[^\]]+\])/)
          const protagonistMatch = content.match(/protagonist:\s*"([^"]+)"/)
          const antagonistMatch = content.match(/antagonist:\s*"([^"]+)"/)
          const emotionalArcMatch = content.match(/emotionalArc:\s*"([^"]+)"/)
          const punchlineMatch = content.match(/>\s*"([^"]+)"/)
          const visualPromptMatch = content.match(/`([^`]+)`/)

          let tags: string[] = []
          try {
            if (tagsMatch) tags = JSON.parse(tagsMatch[1])
          } catch (e) {}

          const summaryMatch = content.match(/## 1\. 리얼 에피소드 요약[^\n]*\n([\s\S]*?)\n## 2\./)

          episodes.push({
            id: idMatch ? idMatch[1] : path.basename(file, '.md'),
            title: titleMatch ? titleMatch[1] : '',
            category: categoryMatch ? categoryMatch[1] : cat,
            tags,
            protagonist: protagonistMatch ? protagonistMatch[1] : '',
            antagonist: antagonistMatch ? antagonistMatch[1] : '',
            emotionalArc: emotionalArcMatch ? emotionalArcMatch[1] : '',
            summary: summaryMatch ? summaryMatch[1].trim() : '',
            punchline: punchlineMatch ? punchlineMatch[1] : '',
            visualPrompt: visualPromptMatch ? visualPromptMatch[1] : '',
            rawContent: content
          })
        }
      }
    }

    return episodes
  } catch (err) {
    console.error('[KnowledgeDB] Error loading Obsidian story episodes:', err)
    return []
  }
}

/**
 * 카테고리 및 사용자 주제 키워드로 최적의 스토리 에피소드 노드를 로드
 */
export async function matchEpisodesByCategoryAndTopic(category?: string, topic?: string): Promise<StoryEpisodeNode[]> {
  const all = getAllEpisodes()
  if (all.length === 0) return []

  const cleanCat = (category || '').toLowerCase().trim()
  const cleanTopic = (topic || '').toLowerCase().trim()

  const scored = all.map(ep => {
    let score = 0

    // 1. 카테고리 일치
    if (cleanCat && ep.category.toLowerCase() === cleanCat) {
      score += 500
    }

    // 2. 주제/태그 매칭
    if (cleanTopic) {
      if (ep.title.toLowerCase().includes(cleanTopic)) score += 300
      if (ep.summary.toLowerCase().includes(cleanTopic)) score += 200
      for (const tag of ep.tags) {
        if (cleanTopic.includes(tag.toLowerCase()) || tag.toLowerCase().includes(cleanTopic)) {
          score += 150
        }
      }
    }

    return { ep, score }
  })

  // 점수가 높은 순 정렬
  scored.sort((a, b) => b.score - a.score)

  // 카테고리 매칭 노드가 있으면 상위 2개 반환, 없으면 기본 전체 상위 2개
  const results = scored.filter(s => s.score > 0).map(s => s.ep)
  if (results.length > 0) return results.slice(0, 2)
  
  // 카테고리로 기본 필터링
  const catOnly = all.filter(ep => ep.category.toLowerCase() === cleanCat)
  if (catOnly.length > 0) return catOnly.slice(0, 2)

  return all.slice(0, 2)
}

