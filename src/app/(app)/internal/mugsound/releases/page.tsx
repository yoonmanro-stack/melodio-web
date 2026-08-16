import { redirect } from 'next/navigation'

export default async function MugSoundReleasesPage() {
  redirect('/internal/mugsound/approvals')
}
