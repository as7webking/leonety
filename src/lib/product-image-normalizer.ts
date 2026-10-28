import sharp from 'sharp'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { BUSINESS_IMAGE_MAX_INPUT_BYTES, BUSINESS_IMAGE_MAX_OUTPUT_BYTES } from './business-image-limits.ts'

const MAX_PIXELS = 25_000_000
const MAX_SIDE = 20_000

export type ProductImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export class ProductImageValidationError extends Error {
  readonly code: 'unsupported_image_type' | 'image_too_large' | 'corrupt_image' | 'conversion_failed'

  constructor(code: 'unsupported_image_type' | 'image_too_large' | 'corrupt_image' | 'conversion_failed') {
    super(code)
    this.name = 'ProductImageValidationError'
    this.code = code
  }
}

function detectRasterContainer(input: Buffer) {
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'jpeg'
  if (input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (input.length >= 12 && input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (input.length >= 6 && ['GIF87a', 'GIF89a'].includes(input.toString('ascii', 0, 6))) return 'gif'
  if (input.length >= 4 && (input.toString('ascii', 0, 4) === 'II*\0' || input.toString('ascii', 0, 4) === 'MM\0*')) return 'tiff'
  if (input.length >= 2 && input.toString('ascii', 0, 2) === 'BM') return 'bmp'
  if (input.length >= 12 && input.toString('ascii', 4, 8) === 'ftyp') {
    const brands = input.toString('ascii', 8, Math.min(input.length, 64))
    if (/avif|avis|heic|heix|hevc|hevx|mif1|msf1/i.test(brands)) return 'heif'
  }
  return null
}

function mimeFor(format: 'jpeg' | 'png' | 'webp'): ProductImageMimeType {
  return format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp'
}

export async function normalizeProductImage(input: Buffer) {
  if (!input.length) throw new ProductImageValidationError('corrupt_image')
  if (input.length > BUSINESS_IMAGE_MAX_INPUT_BYTES) throw new ProductImageValidationError('image_too_large')

  const container = detectRasterContainer(input)
  if (!container) throw new ProductImageValidationError('unsupported_image_type')

  let metadata: sharp.Metadata
  try {
    metadata = await sharp(input, { limitInputPixels: MAX_PIXELS, pages: 1, page: 0, failOn: 'warning' }).metadata()
  } catch (error) {
    if (error instanceof Error && /pixel limit|exceeds.*pixel|image size exceeds/i.test(error.message)) {
      throw new ProductImageValidationError('image_too_large')
    }
    throw new ProductImageValidationError('corrupt_image')
  }

  const swapsOrientation = [5, 6, 7, 8].includes(metadata.orientation ?? 0)
  const width = (swapsOrientation ? metadata.height : metadata.width) ?? 0
  const height = (swapsOrientation ? metadata.width : metadata.height) ?? 0
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new ProductImageValidationError('image_too_large')
  }
  if (metadata.pages && metadata.pages > 1 && container !== 'gif' && container !== 'webp') {
    throw new ProductImageValidationError('unsupported_image_type')
  }

  const directFormat = container === 'jpeg' || container === 'png' || container === 'webp'
  const hasMetadata = Boolean(metadata.exif || metadata.iptc || metadata.xmp)
  const animated = (metadata.pages ?? 1) > 1 || container === 'gif'
  const alpha = Boolean(metadata.hasAlpha)
  if (directFormat && !hasMetadata && !animated && input.length < BUSINESS_IMAGE_MAX_OUTPUT_BYTES) {
    return { buffer: input, mimeType: mimeFor(container), width, height, size: input.length }
  }

  const outputFormat: 'jpeg' | 'webp' = container === 'webp' && !animated
      ? 'webp'
      : alpha || animated
        ? 'webp'
        : 'jpeg'

  const inputImage = () => sharp(input, {
    limitInputPixels: MAX_PIXELS,
    pages: 1,
    page: 0,
    failOn: 'warning',
  }).rotate()

  const scales = [1, 0.85, 0.7, 0.55, 0.4, 0.3]
  const qualities = [88, 78, 68, 58, 48, 38]

  for (const scale of scales) {
    const outputWidth = Math.max(1, Math.round(width * scale))
    const outputHeight = Math.max(1, Math.round(height * scale))
    for (const quality of qualities) {
      try {
        let pipeline = inputImage().resize({ width: outputWidth, height: outputHeight, fit: 'fill', withoutEnlargement: true })
        if (outputFormat === 'jpeg') {
          pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0', progressive: true })
        } else {
          pipeline = pipeline.webp({ quality, alphaQuality: 100, effort: 4 })
        }
        const output = await pipeline.toBuffer({ resolveWithObject: true })
        if (output.data.length < BUSINESS_IMAGE_MAX_OUTPUT_BYTES) {
          return {
            buffer: output.data,
            mimeType: mimeFor(output.info.format as 'jpeg' | 'png' | 'webp'),
            width: output.info.width,
            height: output.info.height,
            size: output.data.length,
          }
        }
      } catch {
        throw new ProductImageValidationError('corrupt_image')
      }
    }

  }

  throw new ProductImageValidationError('conversion_failed')
}
