import ArtistWorkspace from '@/components/artists/ArtistWorkspace'

export default async function Page({ searchParams }: { searchParams: Promise<{ artistId?: string | string[]; stage?: string | string[] }> }) {
  const query = await searchParams
  const initialStep = query.stage === 'voice' ? 1 : query.stage === 'portrait' ? 2 : query.stage === 'review' ? 3 : 0
  return <ArtistWorkspace initialArtistId={typeof query.artistId === 'string' ? query.artistId : undefined} initialStep={initialStep} />
}
