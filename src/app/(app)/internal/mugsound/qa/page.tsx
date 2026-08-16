import { redirect } from 'next/navigation'

export default async function MugSoundQaPage() {
  redirect('/internal/mugsound/review')
}
