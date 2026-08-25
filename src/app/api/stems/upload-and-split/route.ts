import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Retired legacy endpoint. It accepted large files through Vercel and stored
 * user audio in the public bucket. New clients must use the authenticated
 * prepare-upload -> signed private upload -> confirm-and-split flow.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: '이전 업로드 방식은 보안을 위해 종료되었습니다. Stem Studio에서 다시 업로드해 주세요.',
      replacement: '/api/stems/prepare-upload',
    },
    { status: 410 },
  )
}
