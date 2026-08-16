import 'server-only'

import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type MugSoundOperatorRole = 'producer' | 'qa' | 'approver'

export interface MugSoundAccess {
  userId: string
  email: string
  roles: MugSoundOperatorRole[]
}

export const getMugSoundAccess = cache(async (): Promise<MugSoundAccess | null> => {
  const client = await createClient()
  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user) return null

  const { data: assignments, error: roleError } = await client
    .from('mugsound_operator_roles')
    .select('role')
    .eq('user_id', userData.user.id)

  if (roleError || !assignments?.length) return null
  return {
    userId: userData.user.id,
    email: userData.user.email || '',
    roles: assignments.map((assignment) => assignment.role),
  }
})

export async function requireMugSoundAccess(
  allowedRoles?: readonly MugSoundOperatorRole[],
): Promise<MugSoundAccess> {
  const client = await createClient()
  const { data } = await client.auth.getUser()
  if (!data.user) redirect('/login')

  const access = await getMugSoundAccess()
  if (!access) notFound()
  if (allowedRoles && !access.roles.some((role) => allowedRoles.includes(role))) notFound()
  return access
}
