import { EpisodePublishPackage } from '@/components/channel-builder/EpisodePublishPackage'

export default async function PublishPackagePage({ params }: { params: Promise<{ channelId: string; episodeId: string }> }) {
  const { channelId, episodeId } = await params
  return <EpisodePublishPackage channelId={channelId} episodeId={episodeId} />
}
