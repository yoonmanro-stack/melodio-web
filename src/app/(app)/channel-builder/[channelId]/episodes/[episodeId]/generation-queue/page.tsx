import { GenerationQueue } from '@/components/channel-builder/GenerationQueue'

export default async function GenerationQueuePage({
  params,
}: {
  params: Promise<{ channelId: string; episodeId: string }>
}) {
  const { channelId, episodeId } = await params
  return <GenerationQueue channelId={channelId} episodeId={episodeId} />
}
