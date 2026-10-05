import ArtistPersonaWorkspace from '@/components/artists/ArtistPersonaWorkspace'

export default async function Page({ searchParams }: { searchParams: Promise<{ artistId?: string | string[] }> }) {
  const query = await searchParams
  return <ArtistPersonaWorkspace initialArtistId={typeof query.artistId === 'string' ? query.artistId : undefined} />
}
