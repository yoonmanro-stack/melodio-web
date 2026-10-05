import ArtistWorkspace from '@/components/artists/ArtistWorkspace'

export default async function Page({ searchParams }: { searchParams: Promise<{ artistId?: string | string[] }> }) {
  const query = await searchParams
  return <ArtistWorkspace mode="incubator" initialArtistId={typeof query.artistId === 'string' ? query.artistId : undefined} />
}
