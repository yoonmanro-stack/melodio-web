import { presets } from '@/data/presets'
import { ChannelBuilder } from '@/components/channel-builder/ChannelBuilder'

export default function ChannelBuilderPage() {
  return <ChannelBuilder presets={presets} />
}
