import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
// @ts-expect-error Node's native TypeScript runner requires an explicit extension.
import { BUSINESS_IMAGE_MAX_OUTPUT_BYTES, BusinessImageError, normalizeBusinessImage } from './business-image-normalizer.ts'

function bmp24(width: number, height: number) {
  const stride = Math.ceil((width * 3) / 4) * 4
  const offset = 54
  const data = Buffer.alloc(offset + stride * height)
  data.write('BM', 0)
  data.writeUInt32LE(data.length, 2)
  data.writeUInt32LE(offset, 10)
  data.writeUInt32LE(40, 14)
  data.writeInt32LE(width, 18)
  data.writeInt32LE(height, 22)
  data.writeUInt16LE(1, 26)
  data.writeUInt16LE(24, 28)
  data.writeUInt32LE(stride * height, 34)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = offset + y * stride + x * 3
      data[i] = 20
      data[i + 1] = 100
      data[i + 2] = 220
    }
  }
  return data
}

async function assertNormalized(input: Buffer) {
  const result = await normalizeBusinessImage(input)
  assert.ok(result.size < BUSINESS_IMAGE_MAX_OUTPUT_BYTES)
  const metadata = await sharp(result.buffer).metadata()
  assert.equal(metadata.format, 'jpeg')
  assert.equal(result.buffer.length, result.size)
  assert.equal(metadata.exif, undefined)
  assert.equal(metadata.icc, undefined)
  assert.equal(metadata.orientation, undefined)
  return result
}

test('normalizes JPEG, PNG, transparent PNG, WebP, AVIF, TIFF and first GIF frame', async () => {
  const base = sharp({ create: { width: 96, height: 64, channels: 4, background: { r: 200, g: 10, b: 40, alpha: 1 } } })
  const fixtures = await Promise.all([
    base.clone().jpeg().toBuffer(),
    base.clone().png().toBuffer(),
    sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer(),
    base.clone().webp().toBuffer(),
    base.clone().avif().toBuffer(),
    base.clone().heif({ compression: 'av1' }).toBuffer(),
    base.clone().tiff().toBuffer(),
  ])
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  for (const fixture of [...fixtures, gif]) await assertNormalized(fixture)
})

test('normalizes uncompressed BMP and rejects SVG instead of rasterizing untrusted markup', async () => {
  await assertNormalized(bmp24(17, 11))
  await assert.rejects(
    normalizeBusinessImage(Buffer.from('<!-- imported art --><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
    (error: unknown) => error instanceof BusinessImageError && error.code === 'unsupported_image_type'
  )
})

test('rejects corrupt bytes, unsupported BMP variants, oversize input and image bombs', async () => {
  await assert.rejects(normalizeBusinessImage(Buffer.from('not an image')), (error: unknown) => error instanceof BusinessImageError && error.code === 'corrupt_image')
  await assert.rejects(normalizeBusinessImage(Buffer.alloc(12 * 1024 * 1024 + 1)), (error: unknown) => error instanceof BusinessImageError && error.code === 'image_too_large')
  await assert.rejects(
    normalizeBusinessImage(await sharp({ create: { width: 5200, height: 5000, channels: 3, background: '#777' } }).jpeg().toBuffer()),
    (error: unknown) => error instanceof BusinessImageError && error.code === 'image_too_large'
  )
})

test('auto-orients EXIF images, strips metadata and adapts output below 200 KB', async () => {
  const oriented = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#346' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const orientedResult = await assertNormalized(oriented)
  assert.ok(orientedResult.height > orientedResult.width)

  const pixels = Buffer.alloc(1800 * 1800 * 3)
  let state = 0x12345678
  for (let index = 0; index < pixels.length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    pixels[index] = state >>> 24
  }
  const noisy = await sharp(pixels, { raw: { width: 1800, height: 1800, channels: 3 } }).jpeg({ quality: 98 }).toBuffer()
  const result = await assertNormalized(noisy)
  assert.ok(result.size < BUSINESS_IMAGE_MAX_OUTPUT_BYTES)
})

test('flattens transparent pixels onto white', async () => {
  const transparent = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 10, g: 200, b: 30, alpha: 0 } } }).png().toBuffer()
  const result = await normalizeBusinessImage(transparent)
  const pixel = await sharp(result.buffer).raw().toBuffer()
  assert.ok(pixel[0] > 245 && pixel[1] > 245 && pixel[2] > 245)
})
