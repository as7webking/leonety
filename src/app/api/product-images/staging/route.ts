import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwnedCompany } from '@/app/api/woocommerce/_utils'

export const runtime = 'nodejs'

const requestSchema = z.object({ companyId: z.string().uuid() })
const bucket = 'product-images'

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const access = await requireOwnedCompany(parsed.data.companyId)
  if (access.error) return NextResponse.json({ error: 'workspace_access_denied' }, { status: access.error.status })

  const { company, user, adminSupabase } = access
  const folder = `${company.id}/products/normalization-staging/${user.id}`
  const { data: oldFiles } = await adminSupabase.storage.from(bucket).list(folder, { limit: 1000 })
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const stale = (oldFiles ?? [])
    .filter((file) => file.name && file.created_at && new Date(file.created_at).getTime() < cutoff)
    .map((file) => `${folder}/${file.name}`)
  if (stale.length) await adminSupabase.storage.from(bucket).remove(stale)

  const path = `${folder}/${crypto.randomUUID()}.upload`
  const { data, error } = await adminSupabase.storage.from(bucket).createSignedUploadUrl(path, { upsert: false })
  if (error || !data?.token) return NextResponse.json({ error: 'image_upload_unavailable' }, { status: 503 })

  return NextResponse.json({ path, token: data.token })
}
