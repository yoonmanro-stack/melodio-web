import { EpisodeReview } from '@/components/channel-builder/EpisodeReview'

export default async function EpisodeReviewPage({
  params,
}: {
  params: Promise<{ channelId: string; episodeId: string }>
}) {
  const { channelId, episodeId } = await params
  return <EpisodeReview channelId={channelId} episodeId={episodeId} />
}
