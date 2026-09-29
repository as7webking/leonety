'use client'

import { useMemo, useRef, useState } from 'react'
import { FileImage, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/i18n-context'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import { buildProductMenuDocument, type ProductMenuItem, type ProductMenuTemplate } from '@/lib/product-menu'

interface Props {
  companyName: string
  products: ProductMenuItem[]
}

const templates: ProductMenuTemplate[] = ['classic', 'modern', 'minimal', 'bold', 'custom']

function colorToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`
}

async function readReference(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('invalid_reference')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 48
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('invalid_reference')
  context.drawImage(bitmap, 0, 0, 48, 48)
  bitmap.close()
  const pixels = context.getImageData(0, 0, 48, 48).data
  let red = 0; let green = 0; let blue = 0; let count = 0
  let accent = { red: 80, green: 80, blue: 80, score: -1 }
  for (let index = 0; index < pixels.length; index += 16) {
    const r = pixels[index]; const g = pixels[index + 1]; const b = pixels[index + 2]; const alpha = pixels[index + 3]
    if (alpha < 180) continue
    red += r; green += g; blue += b; count += 1
    const score = Math.max(r, g, b) - Math.min(r, g, b)
    if (score > accent.score) accent = { red:r, green:g, blue:b, score }
  }
  const background = colorToHex(red / Math.max(1, count), green / Math.max(1, count), blue / Math.max(1, count))
  const luminance = (red + green + blue) / Math.max(1, count) / 3
  return { dataUrl, colors: { background, foreground: luminance > 145 ? '#171717' : '#ffffff', accent: colorToHex(accent.red, accent.green, accent.blue) } }
}

export function ProductMenuBuilderDialog({ companyName, products }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [template, setTemplate] = useState<ProductMenuTemplate>('classic')
  const [showDescriptions, setShowDescriptions] = useState(true)
  const [showImages, setShowImages] = useState(true)
  const [showArticles, setShowArticles] = useState(false)
  const [referenceDataUrl, setReferenceDataUrl] = useState('')
  const [customColors, setCustomColors] = useState<{ background:string; foreground:string; accent:string } | undefined>()
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  useBodyScrollLock(open)

  const documentHtml = useMemo(() => buildProductMenuDocument(products, {
    template, title: t('productMenu.menuTitle'), companyName, uncategorizedLabel: t('productMenu.uncategorized'),
    showDescriptions, showImages, showArticles, customColors,
  }), [companyName, customColors, products, showArticles, showDescriptions, showImages, t, template])

  const close = () => { setOpen(false); setError('') }
  const handleReference = async (file: File | null) => {
    if (!file) return
    setError('')
    try {
      const reference = await readReference(file)
      setReferenceDataUrl(reference.dataUrl)
      setCustomColors(reference.colors)
      setTemplate('custom')
    } catch {
      setError(t('productMenu.customReferenceFailed'))
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  const printMenu = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.opener = null
    printWindow.document.open()
    printWindow.document.write(documentHtml)
    printWindow.document.close()
    printWindow.addEventListener('load', () => { printWindow.focus(); printWindow.print() }, { once: true })
  }

  return (
    <>
      <Button type="button" variant="outline" className="h-auto min-h-10 whitespace-normal" disabled={products.length === 0} title={products.length === 0 ? t('productMenu.selectProductsFirst') : undefined} onClick={() => setOpen(true)}><FileImage className="h-4 w-4 shrink-0" />{t('productMenu.menuCreate')}</Button>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-slate-950/55 p-0 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-5" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="menu-builder-title" className="flex max-h-[96dvh] w-full max-w-7xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-4 border-b p-4 sm:p-5"><div className="min-w-0"><h2 id="menu-builder-title" className="text-xl font-semibold">{t('productMenu.menuCreate')}</h2><p className="mt-1 text-sm text-slate-500">{t('productMenu.menuDescription')}</p></div><Button type="button" variant="ghost" size="icon" onClick={close} aria-label={t('productMenu.close')}><X className="h-5 w-5" /></Button></div>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden">
              <aside className="space-y-5 border-b p-4 sm:p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
                <div><p className="mb-2 text-sm font-medium">{t('productMenu.template')}</p><div className="grid grid-cols-2 gap-2">{templates.map((value) => <button type="button" key={value} onClick={() => setTemplate(value)} disabled={value === 'custom' && !customColors} className={`rounded-md border px-3 py-2 text-left text-sm ${template === value ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200'} disabled:cursor-not-allowed disabled:opacity-50`}>{t(`productMenu.template${value[0].toUpperCase()}${value.slice(1)}`)}</button>)}</div></div>
                <label className="block space-y-2"><span className="text-sm font-medium">{t('productMenu.customReference')}</span><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleReference(event.target.files?.[0] ?? null)} className="block w-full max-w-full text-sm" /><span className="block text-xs text-slate-500">{t('productMenu.customReferenceHint')}</span></label>
                {referenceDataUrl && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-500">{t('productMenu.referencePreview')}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={referenceDataUrl} alt="" className="max-h-40 w-full rounded-md border object-contain" />
                  </div>
                )}
                {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                <div className="space-y-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDescriptions} onChange={(event) => setShowDescriptions(event.target.checked)} />{t('productMenu.showDescriptions')}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showImages} onChange={(event) => setShowImages(event.target.checked)} />{t('productMenu.showImages')}</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArticles} onChange={(event) => setShowArticles(event.target.checked)} />{t('productMenu.showArticles')}</label></div>
                <p className="text-sm text-slate-500">{t('productMenu.selectedProductsCount').replace('{count}', String(products.length))}</p>
              </aside>
              <section className="min-h-[60vh] bg-slate-100 p-3 sm:p-5 lg:min-h-0 lg:overflow-y-auto" aria-label={t('productMenu.preview')}><div className="mx-auto aspect-[210/297] w-full max-w-[794px] overflow-hidden bg-white shadow"><iframe title={t('productMenu.preview')} srcDoc={documentHtml} className="h-full w-full border-0" /></div></section>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4 sm:p-5"><Button type="button" variant="outline" onClick={close}>{t('productMenu.close')}</Button><Button type="button" onClick={printMenu}><Printer className="h-4 w-4" />{t('productMenu.printPdf')}</Button></div>
          </div>
        </div>
      )}
    </>
  )
}
