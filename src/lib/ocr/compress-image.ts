import sharp from 'sharp'

interface CompressResult {
  /** WebP buffer of the compressed thumbnail */
  buffer: Buffer
  /** MIME type — always "image/webp" */
  mimeType: string
  /** Width in pixels after resize */
  width: number
  /** Height in pixels after resize */
  height: number
}

const THUMBNAIL_MAX_WIDTH = 800
const THUMBNAIL_QUALITY = 75

/**
 * Takes a raw image buffer (JPEG/PNG/WebP/HEIC from a phone camera)
 * and returns a compressed WebP thumbnail.
 *
 * The thumbnail is large enough to read receipt text on screen
 * but small enough for cheap storage (~30-120KB).
 */
export async function compressReceiptImage(inputBuffer: Buffer): Promise<CompressResult> {
  const image = sharp(inputBuffer)
  const metadata = await image.metadata()

  const resized = image
    .resize({
      width: THUMBNAIL_MAX_WIDTH,
      withoutEnlargement: true, // don't upscale small images
    })
    .webp({ quality: THUMBNAIL_QUALITY })

  const outputBuffer = await resized.toBuffer()
  const outputMeta = await sharp(outputBuffer).metadata()

  return {
    buffer: outputBuffer,
    mimeType: 'image/webp',
    width: outputMeta.width ?? metadata.width ?? 0,
    height: outputMeta.height ?? metadata.height ?? 0,
  }
}
