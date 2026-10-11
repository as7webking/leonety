import sharp from 'sharp'
import libheif from 'libheif-js/wasm-bundle.js'
// @ts-expect-error Node's native TypeScript runner requires an explicit extension.
import { BUSINESS_IMAGE_MAX_INPUT_BYTES, BUSINESS_IMAGE_MAX_OUTPUT_BYTES } from './business-image-limits.ts'

// @ts-expect-error Node's native TypeScript runner requires an explicit extension.
export { BUSINESS_IMAGE_MAX_INPUT_BYTES, BUSINESS_IMAGE_MAX_OUTPUT_BYTES } from './business-image-limits.ts'
const MAX_PIXELS = 25_000_000
const MAX_SIDE = 20_000

export type BusinessImageErrorCode = 'unsupported_image_type' | 'image_too_large' | 'corrupt_image' | 'conversion_failed'

export class BusinessImageError extends Error {
  readonly code: BusinessImageErrorCode

  constructor(code: BusinessImageErrorCode) {
    super(code)
    this.name = 'BusinessImageError'
    this.code = code
  }
}

type HeifImage = {
  get_width(): number
  get_height(): number
  is_primary(): boolean
  display(imageData: { data: Uint8ClampedArray; width: number; height: number }, callback: (value: unknown) => void): void
}

type HeifDecoderModule = {
  HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] }
}

const heifDecoderModule = libheif as unknown as HeifDecoderModule

function ensureDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new BusinessImageError('image_too_large')
  }
}

function isHeicContainer(input: Buffer) {
  if (input.length < 12 || input.toString('ascii', 4, 8) !== 'ftyp') return false
  const brand = input.toString('ascii', 8, 12)
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand)
}

function isSvgOrXml(input: Buffer) {
  const content = input.toString('latin1').toLowerCase()
  return content.includes('<svg') || content.includes('<?xml') || content.includes('<!doctype')
}

function decodeBmp(input: Buffer) {
  if (input.length < 54 || input.toString('ascii', 0, 2) !== 'BM') throw new BusinessImageError('corrupt_image')
  const pixelOffset = input.readUInt32LE(10)
  const headerSize = input.readUInt32LE(14)
  if (headerSize < 40 || 14 + headerSize > input.length) throw new BusinessImageError('unsupported_image_type')

  const width = input.readInt32LE(18)
  const signedHeight = input.readInt32LE(22)
  const planes = input.readUInt16LE(26)
  const bitsPerPixel = input.readUInt16LE(28)
  const compression = input.readUInt32LE(30)
  if (width <= 0 || signedHeight === 0 || planes !== 1 || ![24, 32].includes(bitsPerPixel) || compression !== 0) {
    throw new BusinessImageError('unsupported_image_type')
  }

  const height = Math.abs(signedHeight)
  ensureDimensions(width, height)
  const bytesPerPixel = bitsPerPixel / 8
  const stride = Math.ceil((width * bytesPerPixel) / 4) * 4
  if (pixelOffset + stride * height > input.length) throw new BusinessImageError('corrupt_image')

  const rgba = Buffer.allocUnsafe(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceY = signedHeight > 0 ? height - 1 - y : y
    const sourceRow = pixelOffset + sourceY * stride
    for (let x = 0; x < width; x += 1) {
      const source = sourceRow + x * bytesPerPixel
      const target = (y * width + x) * 4
      rgba[target] = input[source + 2]
      rgba[target + 1] = input[source + 1]
      rgba[target + 2] = input[source]
      rgba[target + 3] = 255
    }
  }

  return sharp(rgba, { raw: { width, height, channels: 4 }, limitInputPixels: MAX_PIXELS })
}

async function decodeHeic(input: Buffer) {
  let images: HeifImage[]
  try {
    images = new heifDecoderModule.HeifDecoder().decode(input)
  } catch {
    throw new BusinessImageError('corrupt_image')
  }

  const image = images.find((candidate) => candidate.is_primary()) ?? images[0]
  if (!image) throw new BusinessImageError('corrupt_image')

  const width = image.get_width()
  const height = image.get_height()
  ensureDimensions(width, height)
  const pixels = new Uint8ClampedArray(width * height * 4)
  const rgba = await new Promise<Uint8ClampedArray>((resolve, reject) => {
    try {
      image.display({ data: pixels, width, height }, (value) => value ? resolve(pixels) : reject(new BusinessImageError('corrupt_image')))
    } catch {
      reject(new BusinessImageError('corrupt_image'))
    }
  })

  return sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
    raw: { width, height, channels: 4 },
    limitInputPixels: MAX_PIXELS,
  })
}

export async function normalizeBusinessImage(input: Buffer) {
  if (!input.length) throw new BusinessImageError('corrupt_image')
  if (input.length > BUSINESS_IMAGE_MAX_INPUT_BYTES) throw new BusinessImageError('image_too_large')
  if (isSvgOrXml(input)) throw new BusinessImageError('unsupported_image_type')

  let source: sharp.Sharp
  if (input.toString('ascii', 0, 2) === 'BM') {
    source = decodeBmp(input)
  } else if (isHeicContainer(input)) {
    source = await decodeHeic(input)
  } else {
    let metadata: sharp.Metadata
    try {
      metadata = await sharp(input, { limitInputPixels: MAX_PIXELS, pages: 1, page: 0, failOn: 'warning' }).metadata()
    } catch (error) {
      if (error instanceof Error && /pixel limit|exceeds.*pixel|image size exceeds/i.test(error.message)) {
        throw new BusinessImageError('image_too_large')
      }
      throw new BusinessImageError('corrupt_image')
    }

    if (metadata.format === 'heif' && metadata.compression === 'hevc') {
      source = await decodeHeic(input)
    } else if (['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff', 'gif'].includes(metadata.format ?? '')) {
      ensureDimensions(metadata.width ?? 0, metadata.height ?? 0)
      source = sharp(input, { limitInputPixels: MAX_PIXELS, pages: 1, page: 0, failOn: 'warning' }).autoOrient()
    } else {
      throw new BusinessImageError('unsupported_image_type')
    }
  }

  const dimensionLimits = [2048, 1536, 1152, 864, 640, 480, 320]
  const qualities = [82, 64]

  for (const side of dimensionLimits) {
    for (const quality of qualities) {
      try {
        const output = await source.clone()
          .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0', progressive: true })
          .toBuffer({ resolveWithObject: true })

        if (output.info.format === 'jpeg' && output.data.length < BUSINESS_IMAGE_MAX_OUTPUT_BYTES) {
          return { buffer: output.data, width: output.info.width, height: output.info.height, size: output.data.length }
        }
      } catch (error) {
        if (error instanceof BusinessImageError) throw error
        throw new BusinessImageError('corrupt_image')
      }
    }
  }

  throw new BusinessImageError('conversion_failed')
}
