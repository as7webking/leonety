export type ProductMenuTemplate = 'classic' | 'modern' | 'minimal' | 'bold' | 'custom'

export interface ProductMenuItem {
  id: string
  name: string
  description: string | null
  category: string | null
  sku: string | null
  sellingPrice: number | null
  currency: string
  imageUrl: string | null
}

export interface ProductMenuOptions {
  template: ProductMenuTemplate
  title: string
  companyName: string
  uncategorizedLabel: string
  showDescriptions: boolean
  showImages: boolean
  showArticles: boolean
  customColors?: { background: string; foreground: string; accent: string }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[character] ?? character)
}

function safeImageUrl(value: string | null) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? escapeHtml(url.toString()) : ''
  } catch {
    return ''
  }
}

function plainDescription(value: string | null) {
  return value ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

function templateColors(template: ProductMenuTemplate, custom?: ProductMenuOptions['customColors']) {
  if (template === 'custom' && custom) return custom
  if (template === 'modern') return { background:'#f3f7f8',foreground:'#102a2e',accent:'#087f8c' }
  if (template === 'minimal') return { background:'#ffffff',foreground:'#18181b',accent:'#71717a' }
  if (template === 'bold') return { background:'#fff7ed',foreground:'#1c1917',accent:'#c2410c' }
  return { background:'#fffdf7',foreground:'#292524',accent:'#7c2d12' }
}

export function buildProductMenuDocument(items: ProductMenuItem[], options: ProductMenuOptions) {
  const colors = templateColors(options.template, options.customColors)
  const groups = new Map<string, ProductMenuItem[]>()
  for (const item of items) {
    const category = item.category?.trim() || options.uncategorizedLabel
    groups.set(category, [...(groups.get(category) ?? []), item])
  }
  const categories = [...groups.entries()].map(([category, products]) => `
    <section class="category">
      <h2>${escapeHtml(category)}</h2>
      <div class="items">${products.map((product) => {
        const image = options.showImages ? safeImageUrl(product.imageUrl) : ''
        const description = options.showDescriptions ? plainDescription(product.description) : ''
        const price = product.sellingPrice === null ? '' : new Intl.NumberFormat(undefined, { style:'currency', currency:product.currency }).format(product.sellingPrice)
        return `<article class="item">${image ? `<img src="${image}" alt="">` : ''}<div class="copy"><div class="line"><h3>${escapeHtml(product.name)}</h3><strong>${escapeHtml(price)}</strong></div>${options.showArticles && product.sku ? `<p class="sku">${escapeHtml(product.sku)}</p>` : ''}${description ? `<p class="description">${escapeHtml(description)}</p>` : ''}</div></article>`
      }).join('')}</div>
    </section>`).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(options.title)}</title><style>
    @page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}html,body{margin:0;background:${colors.background};color:${colors.foreground};font-family:Inter,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{padding:0}header{padding:8mm 0 7mm;border-bottom:2px solid ${colors.accent};text-align:${options.template === 'modern' || options.template === 'bold' ? 'left' : 'center'}}header p{margin:0 0 2mm;font-size:10pt;text-transform:uppercase;letter-spacing:.08em;color:${colors.accent}}h1{margin:0;font-family:${options.template === 'classic' ? 'Georgia,serif' : 'inherit'};font-size:${options.template === 'bold' ? '30pt' : '25pt'}}.category{break-inside:avoid;margin-top:8mm}.category h2{margin:0 0 3mm;padding-bottom:2mm;border-bottom:1px solid ${colors.accent};font-size:15pt;color:${colors.accent};font-family:${options.template === 'classic' ? 'Georgia,serif' : 'inherit'}}.items{display:grid;grid-template-columns:${options.template === 'modern' || options.template === 'bold' ? '1fr 1fr' : '1fr'};gap:4mm 7mm}.item{display:flex;gap:3mm;break-inside:avoid;padding:${options.template === 'bold' ? '3mm' : '1mm 0'};${options.template === 'bold' ? `border:1px solid ${colors.accent};background:#fff` : ''}}.item img{width:24mm;height:20mm;object-fit:cover;flex:none}.copy{min-width:0;flex:1}.line{display:flex;align-items:baseline;justify-content:space-between;gap:4mm}.line h3{margin:0;font-size:11pt}.line strong{white-space:nowrap;font-size:10.5pt;color:${colors.accent}}.description,.sku{margin:1mm 0 0;font-size:8.5pt;line-height:1.35}.description{color:${colors.foreground};opacity:.78}.sku{font-size:7.5pt;color:${colors.accent}}@media print{html,body{width:auto;min-height:0}.category:last-child{break-after:auto}}
  </style></head><body><header><p>${escapeHtml(options.companyName)}</p><h1>${escapeHtml(options.title)}</h1></header>${categories}</body></html>`
}
