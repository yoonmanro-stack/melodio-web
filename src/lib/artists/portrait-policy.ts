// Source files can be larger than the server's safe multipart payload.
export const MAX_ARTIST_PORTRAIT_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_ARTIST_PORTRAIT_TRANSFER_BYTES = 4 * 1024 * 1024
export const MAX_ARTIST_PORTRAIT_BYTES = 4 * 1024 * 1024
export const ARTIST_PORTRAIT_FILE_ERROR = 'JPEG, PNG, WebP 사진을 최대 10MB까지 업로드할 수 있습니다.'
