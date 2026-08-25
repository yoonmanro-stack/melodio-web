import StemStudioClient from '@/components/stem/StemStudioClient'

export default async function StemStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string | string[] }>
}) {
  const params = await searchParams
  const initialJobId = typeof params.job === 'string' ? params.job : ''

  return <StemStudioClient initialJobId={initialJobId} />
}
