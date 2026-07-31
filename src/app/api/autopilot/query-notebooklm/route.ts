import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exec } from 'child_process'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user or service role
    const authHeader = request.headers.get('Authorization')
    const apiKeyHeader = request.headers.get('x-api-key')
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    let isAuthorized = false
    
    // Check service role bearer or api key header
    if (serviceRoleKey) {
      if (apiKeyHeader === serviceRoleKey || authHeader === `Bearer ${serviceRoleKey}`) {
        isAuthorized = true
      }
    }

    if (!isAuthorized) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        isAuthorized = true
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 })
    }

    // 2. Parse request payload
    const payload = await request.json()
    const { notebookId, query, action = 'query', text, title } = payload

    if (!notebookId) {
      return NextResponse.json({ error: 'notebookId가 필요합니다.' }, { status: 400 })
    }

    // 3. Resolve path to query_notebooklm.py helper
    const scriptPath = path.resolve(process.cwd(), 'scripts/query_notebooklm.py')

    // 4. Escape inputs for command execution safely
    const escapedNotebookId = notebookId.replace(/["'\\]/g, '')
    let command = ''

    if (action === 'add_text') {
      if (!text || !title) {
        return NextResponse.json({ error: 'add_text 액션에는 text와 title이 필요합니다.' }, { status: 400 })
      }
      const escapedText = text.replace(/"/g, '\\"')
      const escapedTitle = title.replace(/"/g, '\\"')
      command = `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib /opt/homebrew/bin/python3.12 "${scriptPath}" "add_text" "${escapedNotebookId}" "${escapedText}" "${escapedTitle}"`
    } else {
      if (!query) {
        return NextResponse.json({ error: 'query가 필요합니다.' }, { status: 400 })
      }
      const escapedQuery = query.replace(/"/g, '\\"')
      command = `DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib /opt/homebrew/bin/python3.12 "${scriptPath}" "query" "${escapedNotebookId}" "${escapedQuery}"`
    }

    // 5. Execute python helper
    const responseData = await new Promise<any>((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('[query-notebooklm] exec error:', error)
          reject(new Error(stderr || error.message))
          return
        }
        try {
          const trimmed = stdout.trim()
          const jsonStart = trimmed.indexOf('{')
          const jsonEnd = trimmed.lastIndexOf('}')
          if (jsonStart === -1 || jsonEnd === -1 || jsonStart > jsonEnd) {
            throw new Error('No JSON object found in stdout')
          }
          const jsonStr = trimmed.slice(jsonStart, jsonEnd + 1)
          const result = JSON.parse(jsonStr)
          resolve(result)
        } catch (parseErr) {
          console.error('[query-notebooklm] json parse error. raw stdout:', stdout)
          reject(new Error('Failed to parse NotebookLM response.'))
        }
      })
    })

    if (responseData.status === 'error') {
      return NextResponse.json({ error: responseData.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: responseData.data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'NotebookLM query error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
