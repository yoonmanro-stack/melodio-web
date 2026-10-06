import { ARTIST_PORTRAIT_FILE_ERROR, MAX_ARTIST_PORTRAIT_TRANSFER_BYTES, MAX_ARTIST_PORTRAIT_UPLOAD_BYTES } from './portrait-policy'

const DIMENSION_ERROR = '가로·세로가 각각 512px 이상인 사진을 선택해 주세요. 1024px 이상의 선명한 사진을 권장합니다.'
const FILE_ERROR = '사진을 읽지 못했습니다. 정지 이미지인 JPEG, PNG, WebP 파일을 선택해 주세요.'

/** Check encoded dimensions before allocating a potentially large decoded bitmap. */
function sourceDimensions(bytes: Uint8Array, type: string): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length))
  if (type === 'image/png' && bytes.length >= 33 && bytes[0] === 137 && ascii(1, 7) === 'PNG\r\n\u001a\n' && ascii(12, 4) === 'IHDR') {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset)
      if (offset + length + 12 > bytes.length || ascii(offset + 4, 4) === 'acTL') throw new Error(FILE_ERROR)
      offset += length + 12
    }
    return [view.getUint32(16), view.getUint32(20)]
  }
  if (type === 'image/webp' && bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4)
    if (kind === 'VP8X') {
      if (bytes[20] & 2) throw new Error(FILE_ERROR)
      const uint24 = (offset: number) => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16
      return [uint24(24) + 1, uint24(27) + 1]
    }
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const packed = view.getUint32(21, true)
      return [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1]
    }
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff]
    }
  }
  if (type === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
    let offset = 2
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      while (bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]
      if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) break
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue
      const length = view.getUint16(offset)
      if (length < 2 || offset + length > bytes.length) break
      if (frames.has(marker) && length >= 8) return [view.getUint16(offset + 5), view.getUint16(offset + 3)]
      offset += length
    }
  }
  throw new Error(FILE_ERROR)
}

function checkDimensions(width: number, height: number) {
  if (Math.min(width, height) < 512 || Math.max(width, height) > 8192 || width * height > 32 * 1024 * 1024) throw new Error(DIMENSION_ERROR)
}

/** Keep small files unchanged; large sources use the same central square crop as the server. */
export async function prepareArtistPortraitUpload(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > MAX_ARTIST_PORTRAIT_UPLOAD_BYTES) throw new Error(ARTIST_PORTRAIT_FILE_ERROR)
  if (file.size <= MAX_ARTIST_PORTRAIT_TRANSFER_BYTES) return file
  const bytes = new Uint8Array(await file.arrayBuffer())
  checkDimensions(...sourceDimensions(bytes, file.type))
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch { throw new Error(FILE_ERROR) }
  const canvas = document.createElement('canvas')
  try {
    checkDimensions(bitmap.width, bitmap.height)
    canvas.width = 1024; canvas.height = 1024
    const context = canvas.getContext('2d')
    if (!context) throw new Error(FILE_ERROR)
    context.fillStyle = '#18181b'; context.fillRect(0, 0, 1024, 1024)
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
    const edge = Math.min(bitmap.width, bitmap.height)
    context.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, 1024, 1024)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error(FILE_ERROR)), 'image/jpeg', 0.96))
    if (blob.type !== 'image/jpeg' || blob.size <= 0 || blob.size > MAX_ARTIST_PORTRAIT_TRANSFER_BYTES) throw new Error(FILE_ERROR)
    return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified })
  } finally { bitmap.close(); canvas.width = 0; canvas.height = 0 }
}
