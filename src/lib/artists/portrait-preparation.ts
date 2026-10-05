import 'server-only'
import sharp from 'sharp'
import { inspectCoverSample } from '../../../worker/cover-art-quality'

/** Normalize before approval so the reviewed face is the actual song artwork. */
export async function prepareArtistPortrait(bytes: Uint8Array): Promise<Buffer> {
  let prepared: Buffer
  try {
    const source = sharp(bytes, { limitInputPixels: 32 * 1024 * 1024, failOn: 'error', animated: false })
    const metadata = await source.metadata()
    if (!metadata.width || !metadata.height || Math.min(metadata.width, metadata.height) < 512
      || Math.max(metadata.width, metadata.height) > 8192 || (metadata.pages || 1) > 1) throw new Error('artist_portrait_dimensions')
    prepared = await source.rotate().resize(1024, 1024, { fit: 'cover', position: 'centre' })
      .flatten({ background: '#18181b' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer()
  } catch (error) {
    if (error instanceof Error && error.message === 'artist_portrait_dimensions') throw error
    throw new Error('invalid_portrait_file')
  }
  const sample = await sharp(prepared).resize(128, 128).removeAlpha().raw().toBuffer()
  const quality = inspectCoverSample({ width: 1024, height: 1024, rgb: sample, sampleWidth: 128, sampleHeight: 128 })
  if (!quality.accepted) throw new Error('artist_portrait_framing')
  return prepared
}
