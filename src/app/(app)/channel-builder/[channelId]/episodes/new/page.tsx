import { EpisodeBuilder } from '@/components/channel-builder/EpisodeBuilder'

export default async function NewEpisodePage({
  params,
}: {
  params: Promise<{ channelId: string }>
}) {
  const { channelId } = await params
  return <EpisodeBuilder channelId={channelId} />
}
