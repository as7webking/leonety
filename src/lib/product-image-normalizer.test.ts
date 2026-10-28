import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { BUSINESS_IMAGE_MAX_OUTPUT_BYTES } from './business-image-limits.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { normalizeProductImage, ProductImageValidationError } from './product-image-normalizer.ts'

test('retains dimensions, alpha and original bytes for an already-small WebP', async () => {
  const original = await sharp({ create: { width: 72, height: 41, channels: 4, background: { r: 30, g: 100, b: 210, alpha: 0.4 } } }).webp().toBuffer()
  const result = await normalizeProductImage(original)
  const output = await sharp(result.buffer).metadata()

  assert.equal(result.mimeType, 'image/webp')
  assert.equal(result.width, 72)
  assert.equal(result.height, 41)
  assert.equal(output.hasAlpha, true)
  assert.deepEqual(result.buffer, original)
})

test('preserves transparent PNG without an unnecessary recompression', async () => {
  const original = await sharp({ create: { width: 32, height: 19, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
  const result = await normalizeProductImage(original)
  const output = await sharp(result.buffer).metadata()

  assert.equal(result.mimeType, 'image/png')
  assert.equal(result.width, 32)
  assert.equal(result.height, 19)
  assert.equal(output.hasAlpha, true)
  assert.deepEqual(result.buffer, original)
})

test('strips EXIF while retaining correctly oriented dimensions', async () => {
  const original = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#246' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const result = await normalizeProductImage(original)
  const output = await sharp(result.buffer).metadata()

  assert.equal(result.width, 40)
  assert.equal(result.height, 80)
  assert.equal(output.exif, undefined)
  assert.ok(result.size < BUSINESS_IMAGE_MAX_OUTPUT_BYTES)
})

test('optimizes oversized transparent images without flattening alpha', async () => {
  const pixels = Buffer.alloc(640 * 360 * 4)
  let state = 0x12345678
  for (let index = 0; index < pixels.length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    pixels[index] = state >>> 24
  }
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 128
  const original = await sharp(pixels, { raw: { width: 640, height: 360, channels: 4 } }).png().toBuffer()
  const result = await normalizeProductImage(original)
  const output = await sharp(result.buffer).metadata()

  assert.ok(result.size < BUSINESS_IMAGE_MAX_OUTPUT_BYTES)
  assert.ok(result.width <= 640 && result.height <= 360)
  assert.equal(output.hasAlpha, true)
})

test('rejects fake image bytes and malformed raster content independent of MIME claims', async () => {
  await assert.rejects(normalizeProductImage(Buffer.from('image/png')), (error: unknown) => error instanceof ProductImageValidationError && error.code === 'unsupported_image_type')
  await assert.rejects(normalizeProductImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])), (error: unknown) => error instanceof ProductImageValidationError && error.code === 'corrupt_image')
  await assert.rejects(normalizeProductImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), (error: unknown) => error instanceof ProductImageValidationError && error.code === 'unsupported_image_type')
})
