import { EpisodeAssembly } from '@/components/channel-builder/EpisodeAssembly'

export default async function EpisodeAssemblyPage({
  params,
}: {
  params: Promise<{ channelId: string; episodeId: string }>
}) {
  const { channelId, episodeId } = await params
  return <EpisodeAssembly channelId={channelId} episodeId={episodeId} />
}
