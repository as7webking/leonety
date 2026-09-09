'use client'

import { PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Download, RotateCcw, RotateCw, Trash2, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-client'

type CropMode = 'free' | 'original' | '1_1' | '4_3' | '3_2' | '16_9'
type QualityMode = 'high' | 'balanced' | 'small'
type OutputFormat = 'image/jpeg' | 'image/webp'
type OutputSizePreset = 'original' | '512' | '1024' | '1600' | '2048' | 'custom'
type DragMode = 'draw' | 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

interface ImageDetails {
  width: number
  height: number
  size: number | null
  name: string
}

interface ProductImageWorkspaceProps {
  companyId: string
  productName?: string
  value: string
  onChange: (url: string) => void
  t: (key: string) => string
  onMessage?: (message: string) => void
  onError?: (message: string) => void
}

const cropModes: CropMode[] = ['free', 'original', '1_1', '4_3', '3_2', '16_9']
const outputSizes: OutputSizePreset[] = ['original', '512', '1024', '1600', '2048', 'custom']

const qualityMap: Record<QualityMode, number> = {
  high: 0.92,
  balanced: 0.82,
  small: 0.68,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function bytesLabel(value: number | null) {
  if (!value) return '-'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function sanitizeFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'product-image'
}

function extensionForFormat(format: OutputFormat) {
  return format === 'image/webp' ? 'webp' : 'jpg'
}

function aspectForMode(mode: CropMode, details: ImageDetails | null) {
  if (mode === 'free') return null
  if (mode === 'original' && details) return details.width / details.height
  if (mode === '1_1') return 1
  if (mode === '4_3') return 4 / 3
  if (mode === '3_2') return 3 / 2
  if (mode === '16_9') return 16 / 9
  return null
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image_load_failed'))
    image.src = src
  })
}

async function rotateImageToObjectUrl(src: string, rotation: number) {
  const image = await loadImage(src)
  const normalizedRotation = ((rotation % 360) + 360) % 360
  const swap = normalizedRotation === 90 || normalizedRotation === 270
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) throw new Error('image_canvas_failed')

  canvas.width = swap ? image.naturalHeight : image.naturalWidth
  canvas.height = swap ? image.naturalWidth : image.naturalHeight
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((normalizedRotation * Math.PI) / 180)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) resolve(nextBlob)
      else reject(new Error('image_canvas_failed'))
    }, 'image/png', 1)
  })

  return {
    objectUrl: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  }
}

function centeredCrop(details: ImageDetails, mode: CropMode): CropRect {
  const aspect = aspectForMode(mode, details)
  if (!aspect) {
    return {
      x: Math.round(details.width * 0.08),
      y: Math.round(details.height * 0.08),
      width: Math.round(details.width * 0.84),
      height: Math.round(details.height * 0.84),
    }
  }

  let width = details.width * 0.84
  let height = width / aspect
  if (height > details.height * 0.84) {
    height = details.height * 0.84
    width = height * aspect
  }

  return {
    x: Math.round((details.width - width) / 2),
    y: Math.round((details.height - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  }
}

function constrainCrop(crop: CropRect, details: ImageDetails, aspect: number | null): CropRect {
  const minSize = 32
  let width = clamp(crop.width, minSize, details.width)
  let height = clamp(crop.height, minSize, details.height)

  if (aspect) {
    height = width / aspect
    if (height > details.height) {
      height = details.height
      width = height * aspect
    }
    if (height < minSize) {
      height = minSize
      width = height * aspect
    }
  }

  const x = clamp(crop.x, 0, Math.max(0, details.width - width))
  const y = clamp(crop.y, 0, Math.max(0, details.height - height))

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}

function resizeCropFromHandle(
  mode: DragMode,
  startCrop: CropRect,
  dx: number,
  dy: number,
  details: ImageDetails,
  aspect: number | null
) {
  const next = { ...startCrop }

  if (mode.includes('e')) next.width = startCrop.width + dx
  if (mode.includes('s')) next.height = startCrop.height + dy
  if (mode.includes('w')) {
    next.x = startCrop.x + dx
    next.width = startCrop.width - dx
  }
  if (mode.includes('n')) {
    next.y = startCrop.y + dy
    next.height = startCrop.height - dy
  }

  if (aspect) {
    if (mode === 'n' || mode === 's') {
      next.width = next.height * aspect
      next.x = startCrop.x + (startCrop.width - next.width) / 2
    } else {
      next.height = next.width / aspect
      next.y = startCrop.y + (startCrop.height - next.height) / 2
    }
  }

  return constrainCrop(next, details, aspect)
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string
    types?: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}

export function ProductImageWorkspace({ companyId, productName, value, onChange, t, onMessage, onError }: ProductImageWorkspaceProps) {
  const [supabase] = useState(() => createClient())
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const objectUrlsRef = useRef<string[]>([])
  const dragRef = useRef<{
    mode: DragMode
    pointerId: number
    startX: number
    startY: number
    startCrop: CropRect
  } | null>(null)

  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceDetails, setSourceDetails] = useState<ImageDetails | null>(null)
  const [workingUrl, setWorkingUrl] = useState('')
  const [details, setDetails] = useState<ImageDetails | null>(null)
  const [, forceImageLayoutUpdate] = useState(0)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [cropMode, setCropMode] = useState<CropMode>('1_1')
  const [rotation, setRotation] = useState(0)
  const [qualityMode, setQualityMode] = useState<QualityMode>('balanced')
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('image/jpeg')
  const [outputSize, setOutputSize] = useState<OutputSizePreset>('1024')
  const [customSize, setCustomSize] = useState('1200')
  const [processing, setProcessing] = useState(false)
  const [lastOutput, setLastOutput] = useState<{ width: number; height: number; size: number } | null>(null)
  const [lastDownloadName, setLastDownloadName] = useState('')

  useEffect(() => {
    const objectUrls = objectUrlsRef.current
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const displayedCrop = (() => {
    const image = imageRef.current
    if (!image || !crop || !details) return null
    const rect = image.getBoundingClientRect()
    const scaleX = rect.width / details.width
    const scaleY = rect.height / details.height
    return {
      x: crop.x * scaleX,
      y: crop.y * scaleY,
      width: crop.width * scaleX,
      height: crop.height * scaleY,
    }
  })()

  const outputDimensions = useMemo(() => {
    if (!crop) return null
    const selected = outputSize === 'custom' ? Number(customSize) : outputSize === 'original' ? Math.max(crop.width, crop.height) : Number(outputSize)
    const maxSide = clamp(Number.isFinite(selected) && selected > 0 ? selected : 1024, 64, 4096)
    const scale = maxSide / Math.max(crop.width, crop.height)
    return {
      width: Math.max(1, Math.round(crop.width * scale)),
      height: Math.max(1, Math.round(crop.height * scale)),
      enlarging: maxSide > Math.max(crop.width, crop.height),
    }
  }, [crop, customSize, outputSize])

  const initializeWorkingImage = async (url: string, imageDetails: ImageDetails, nextRotation = 0) => {
    const rotated = nextRotation === 0
      ? { objectUrl: url, width: imageDetails.width, height: imageDetails.height }
      : await rotateImageToObjectUrl(url, nextRotation)

    if (nextRotation !== 0) {
      objectUrlsRef.current.push(rotated.objectUrl)
    }

    const nextDetails = {
      ...imageDetails,
      width: rotated.width,
      height: rotated.height,
    }
    setWorkingUrl(rotated.objectUrl)
    setDetails(nextDetails)
    setCrop(centeredCrop(nextDetails, cropMode))
  }

  const handleUpload = async (file: File | null) => {
    if (!file) return
    onMessage?.('')
    onError?.('')

    const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
    if (!supported) {
      onError?.(t('products.unsupportedImageType'))
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      onError?.(t('products.imageTooLarge'))
      return
    }

    try {
      const objectUrl = URL.createObjectURL(file)
      objectUrlsRef.current.push(objectUrl)
      const image = await loadImage(objectUrl)
      const imageDetails = {
        width: image.naturalWidth,
        height: image.naturalHeight,
        size: file.size,
        name: file.name,
      }
      setSourceUrl(objectUrl)
      setSourceDetails(imageDetails)
      setRotation(0)
      setLastOutput(null)
      setLastDownloadName('')
      await initializeWorkingImage(objectUrl, imageDetails, 0)
      onMessage?.(t('products.imageReady'))
    } catch {
      onError?.(t('products.imageCompressionFailed'))
    }
  }

  const handleModeChange = (mode: CropMode) => {
    setCropMode(mode)
    if (!details || !crop) return
    setCrop(constrainCrop(crop, details, aspectForMode(mode, details)))
  }

  const rotate = async (delta: 90 | -90) => {
    if (!sourceUrl || !sourceDetails) return
    onError?.('')
    const nextRotation = ((rotation + delta) % 360 + 360) % 360
    try {
      setProcessing(true)
      setRotation(nextRotation)
      await initializeWorkingImage(sourceUrl, sourceDetails, nextRotation)
    } catch {
      onError?.(t('products.imageCompressionFailed'))
    } finally {
      setProcessing(false)
    }
  }

  const startDrag = (event: PointerEvent<HTMLElement>, mode: DragMode) => {
    if (!crop || !details) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCrop: crop,
    }
  }

  const startDraw = (event: PointerEvent<HTMLDivElement>) => {
    if (!details || !imageRef.current) return
    if ((event.target as HTMLElement).closest('button')) return
    const rect = imageRef.current.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) * (details.width / rect.width), 0, details.width)
    const y = clamp((event.clientY - rect.top) * (details.height / rect.height), 0, details.height)
    const startCrop = { x, y, width: 1, height: 1 }
    setCrop(startCrop)
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      mode: 'draw',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCrop,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || !details || !imageRef.current || drag.pointerId !== event.pointerId) return
    const rect = imageRef.current.getBoundingClientRect()
    const dx = (event.clientX - drag.startX) * (details.width / rect.width)
    const dy = (event.clientY - drag.startY) * (details.height / rect.height)
    const aspect = aspectForMode(cropMode, details)

    if (drag.mode === 'move') {
      setCrop(constrainCrop({
        ...drag.startCrop,
        x: drag.startCrop.x + dx,
        y: drag.startCrop.y + dy,
      }, details, aspect))
      return
    }

    if (drag.mode === 'draw') {
      const next = {
        x: Math.min(drag.startCrop.x, drag.startCrop.x + dx),
        y: Math.min(drag.startCrop.y, drag.startCrop.y + dy),
        width: Math.abs(dx),
        height: Math.abs(dy),
      }
      setCrop(constrainCrop(next, details, aspect))
      return
    }

    setCrop(resizeCropFromHandle(drag.mode, drag.startCrop, dx, dy, details, aspect))
  }

  const stopDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  const zoomCrop = (direction: 'in' | 'out') => {
    if (!crop || !details) return
    const factor = direction === 'in' ? 0.86 : 1.14
    const aspect = aspectForMode(cropMode, details)
    const centerX = crop.x + crop.width / 2
    const centerY = crop.y + crop.height / 2
    const width = crop.width * factor
    const height = aspect ? width / aspect : crop.height * factor
    setCrop(constrainCrop({
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    }, details, aspect))
  }

  const createProcessedImageBlob = async () => {
    if (!workingUrl || !details || !crop || !outputDimensions) {
      throw new Error('image_source_missing')
    }

    const image = await loadImage(workingUrl)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('image_canvas_failed')

    canvas.width = outputDimensions.width
    canvas.height = outputDimensions.height
    if (outputFormat === 'image/jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      canvas.width,
      canvas.height
    )

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob)
        else reject(new Error('image_canvas_failed'))
      }, outputFormat, qualityMap[qualityMode])
    })

    const baseName = sanitizeFilename(productName || details.name)
    const extension = extensionForFormat(outputFormat)
    const filename = `${baseName}-${canvas.width}x${canvas.height}.${extension}`

    return {
      blob,
      filename,
      width: canvas.width,
      height: canvas.height,
    }
  }

  const saveProcessedImage = async () => {
    if (!workingUrl || !details || !crop || !outputDimensions) {
      if (value) onMessage?.(t('products.imageReady'))
      return
    }

    setProcessing(true)
    onMessage?.('')
    onError?.('')

    try {
      const processed = await createProcessedImageBlob()
      const storagePath = `${companyId}/products/${Date.now()}-${processed.filename}`
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(storagePath, processed.blob, {
          contentType: outputFormat,
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('product-images').getPublicUrl(storagePath)
      onChange(data.publicUrl)
      setLastOutput({ width: processed.width, height: processed.height, size: processed.blob.size })
      onMessage?.(t('products.imageProcessed'))
    } catch {
      onError?.(t('products.imageCompressionFailed'))
    } finally {
      setProcessing(false)
    }
  }

  const downloadProcessedImage = async () => {
    if (!workingUrl || !details || !crop || !outputDimensions) return

    setProcessing(true)
    onMessage?.('')
    onError?.('')

    try {
      const processed = await createProcessedImageBlob()
      const picker = (window as SaveFilePickerWindow).showSaveFilePicker

      if (picker) {
        try {
          const handle = await picker({
            suggestedName: processed.filename,
            types: [{
              description: outputFormat === 'image/webp' ? 'WebP image' : 'JPEG image',
              accept: { [outputFormat]: [`.${extensionForFormat(outputFormat)}`] },
            }],
          })
          const writable = await handle.createWritable()
          await writable.write(processed.blob)
          await writable.close()
          setLastDownloadName(processed.filename)
          onMessage?.(t('products.imageDownloaded'))
          return
        } catch (pickerError) {
          if (pickerError instanceof DOMException && pickerError.name === 'AbortError') {
            onMessage?.(t('products.imageDownloadCanceled'))
            return
          }
        }
      }

      const href = URL.createObjectURL(processed.blob)
      const link = document.createElement('a')
      link.href = href
      link.download = processed.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 1000)
      setLastDownloadName(processed.filename)
      onMessage?.(t('products.imageDownloadStarted'))
    } catch {
      onError?.(t('products.imageCompressionFailed'))
    } finally {
      setProcessing(false)
    }
  }

  const removeImage = () => {
    if (!value && !workingUrl) return
    if (!window.confirm(t('products.removeImageConfirm'))) return
    onChange('')
    setSourceUrl('')
    setSourceDetails(null)
    setWorkingUrl('')
    setDetails(null)
    setCrop(null)
    setLastOutput(null)
    setLastDownloadName('')
    onMessage?.(t('products.imageRemoved'))
  }

  const imageStatus = lastDownloadName
    ? t('products.imageStatus.downloaded')
    : value
      ? t('products.imageStatus.saved')
      : workingUrl
        ? t('products.imageStatus.edited')
        : t('products.imageStatus.notDownloaded')

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <UploadCloud className="h-4 w-4" />
            {t('products.uploadImage')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void rotate(-90)} disabled={!workingUrl || processing}>
            <RotateCcw className="h-4 w-4" />
            {t('products.rotateLeft')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void rotate(90)} disabled={!workingUrl || processing}>
            <RotateCw className="h-4 w-4" />
            {t('products.rotateRight')}
          </Button>
          <Button type="button" variant="outline" onClick={() => zoomCrop('in')} disabled={!crop}>
            {t('products.zoomIn')}
          </Button>
          <Button type="button" variant="outline" onClick={() => zoomCrop('out')} disabled={!crop}>
            {t('products.zoomOut')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (sourceUrl && sourceDetails) {
                setRotation(0)
                void initializeWorkingImage(sourceUrl, sourceDetails, 0)
              } else if (details) {
                setCrop(centeredCrop(details, cropMode))
              }
              setLastOutput(null)
            }}
            disabled={!details}
          >
            {t('products.resetImage')}
          </Button>
        </div>

        <div
          className="relative flex min-h-[18rem] touch-none select-none items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-3 sm:min-h-[28rem]"
          onPointerDown={startDraw}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          {workingUrl ? (
            <div className="relative max-h-[72vh] max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imageRef} src={workingUrl} alt="" className="block max-h-[72vh] max-w-full object-contain" draggable={false} onLoad={() => forceImageLayoutUpdate((value) => value + 1)} />
              {displayedCrop && (
                <>
                  <div className="pointer-events-none absolute inset-0 bg-slate-950/45" />
                  <div
                    className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]"
                    style={{
                      left: displayedCrop.x,
                      top: displayedCrop.y,
                      width: displayedCrop.width,
                      height: displayedCrop.height,
                    }}
                  >
                    <button
                      type="button"
                      aria-label={t('products.moveSelection')}
                      className="absolute inset-0 cursor-move"
                      onPointerDown={(event) => startDrag(event, 'move')}
                    />
                    {(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as DragMode[]).map((handle) => (
                      <button
                        key={handle}
                        type="button"
                        aria-label={`${t('products.resizeSelection')} ${handle}`}
                        onPointerDown={(event) => startDrag(event, handle)}
                        className={`absolute h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow ${
                          handle === 'n' ? 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize' :
                          handle === 's' ? 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize' :
                          handle === 'e' ? 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2 cursor-ew-resize' :
                          handle === 'w' ? 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize' :
                          handle === 'nw' ? 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' :
                          handle === 'ne' ? 'right-0 top-0 -translate-y-1/2 translate-x-1/2 cursor-nesw-resize' :
                          handle === 'sw' ? 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize' :
                          'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : value ? (
            <div className="space-y-3 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="" className="mx-auto max-h-[24rem] max-w-full rounded-lg object-contain" />
              <p className="text-sm text-white/75">{t('products.uploadToEditImage')}</p>
            </div>
          ) : (
            <p className="max-w-sm text-center text-sm text-white/75">{t('products.dragToSelectArea')}</p>
          )}
        </div>

        {crop && (
          <p className="text-sm text-slate-600">
            {`${t('products.cropPixels')}: x ${crop.x}, y ${crop.y}, ${crop.width} x ${crop.height}`}
          </p>
        )}
      </div>

      <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-900">{t('woocommerce.imageUrl')}</span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="https://example.com/product.jpg"
          />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-900">{t('products.cropMode')}</p>
          <div className="grid grid-cols-2 gap-2">
            {cropModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleModeChange(mode)}
                className={`rounded-md border px-2 py-2 text-sm ${
                  cropMode === mode ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t(`products.cropMode.${mode}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-900">{t('products.outputSize')}</span>
          <select
            value={outputSize}
            onChange={(event) => setOutputSize(event.target.value as OutputSizePreset)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            {outputSizes.map((size) => (
              <option key={size} value={size}>{t(`products.outputSize.${size}`)}</option>
            ))}
          </select>
        </label>

        {outputSize === 'custom' && (
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-900">{t('products.customMaxSide')}</span>
            <input
              type="number"
              min="64"
              max="4096"
              value={customSize}
              onChange={(event) => setCustomSize(event.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        )}

        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-900">{t('products.outputFormat')}</span>
          <select
            value={outputFormat}
            onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="image/jpeg">JPEG</option>
            <option value="image/webp">WebP</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-900">{t('products.quality')}</span>
          <select
            value={qualityMode}
            onChange={(event) => setQualityMode(event.target.value as QualityMode)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="high">{t('products.quality.high')}</option>
            <option value="balanced">{t('products.quality.balanced')}</option>
            <option value="small">{t('products.quality.small')}</option>
          </select>
        </label>

        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p>{t('products.original')}: {details ? `${details.width} x ${details.height} · ${bytesLabel(details.size)}` : '-'}</p>
          <p>{t('products.output')}: {outputDimensions ? `${outputDimensions.width} x ${outputDimensions.height}` : '-'}</p>
          {lastOutput && <p>{t('products.savedOutput')}: {lastOutput.width} x {lastOutput.height} · {bytesLabel(lastOutput.size)}</p>}
          <p>{t('products.imageStatus')}: {imageStatus}</p>
          {lastDownloadName && <p>{t('products.downloadedFilename')}: {lastDownloadName}</p>}
          {outputDimensions?.enlarging && <p className="text-amber-700">{t('products.enlargementNotice')}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Button type="button" onClick={() => void saveProcessedImage()} disabled={processing || !workingUrl}>
            {processing ? t('products.processingImage') : t('products.saveProcessedImage')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void downloadProcessedImage()} disabled={processing || !workingUrl}>
            <Download className="h-4 w-4" />
            {t('products.downloadImage')}
          </Button>
          <p className="text-xs text-slate-500">{t('products.browserDownloadHint')}</p>
          <Button type="button" variant="outline" onClick={removeImage} disabled={!value && !workingUrl}>
            <Trash2 className="h-4 w-4" />
            {t('products.removeImage')}
          </Button>
        </div>
      </aside>
    </div>
  )
}
