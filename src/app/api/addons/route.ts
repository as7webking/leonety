import { NextResponse } from 'next/server'
import { z } from 'zod'
import { builtInAddonRegistry, canChangeWorkspaceAddonActivation, resolveWorkspaceAddonActivationStates } from '@/lib/addons/registry'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const workspaceIdSchema = z.string().uuid()
const activationSchema = z.object({
  workspaceId: z.string().uuid(),
  addonId: z.string().min(1).max(80),
  enabled: z.boolean(),
})

async function getOwnedWorkspace(client: Awaited<ReturnType<typeof createServerSupabaseClient>>, workspaceId: string, userId: string) {
  const { data, error } = await client
    .from('companies')
    .select('id')
    .eq('id', workspaceId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (error) return { error: 'workspace_check_failed' as const }
  if (!data) return { error: 'workspace_access_denied' as const }
  return { workspace: data }
}

async function authenticate() {
  const client = await createServerSupabaseClient()
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return { response: NextResponse.json({ error: 'not_authenticated' }, { status: 401 }) }
  return { client, user: data.user }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const parsedWorkspaceId = workspaceIdSchema.safeParse(searchParams.get('workspaceId'))
    if (!parsedWorkspaceId.success) return NextResponse.json({ error: 'invalid_workspace' }, { status: 400 })

    const auth = await authenticate()
    if ('response' in auth) return auth.response
    const access = await getOwnedWorkspace(auth.client, parsedWorkspaceId.data, auth.user.id)
    if (access.error) {
      const status = access.error === 'workspace_access_denied' ? 403 : 503
      return NextResponse.json({ error: access.error }, { status })
    }

    const { data, error } = await auth.client
      .from('workspace_addon_activations')
      .select('addon_id, enabled')
      .eq('company_id', parsedWorkspaceId.data)

    if (error) throw error
    const activations = resolveWorkspaceAddonActivationStates(data ?? []).map((activation) => ({
      ...activation,
      canManage: true,
    }))

    return NextResponse.json({
      workspaceId: parsedWorkspaceId.data,
      activations,
      enabledAddonIds: activations.filter((activation) => activation.canOpen).map((activation) => activation.addonId),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[addons] activation read failed', { message: error instanceof Error ? error.message : 'Unknown error' })
    return NextResponse.json({ error: 'addon_status_unavailable' }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const parsed = activationSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'invalid_activation' }, { status: 400 })

    const addon = builtInAddonRegistry.find((entry) => entry.id === parsed.data.addonId)
    if (!addon) return NextResponse.json({ error: 'unknown_addon' }, { status: 404 })

    const auth = await authenticate()
    if ('response' in auth) return auth.response
    const access = await getOwnedWorkspace(auth.client, parsed.data.workspaceId, auth.user.id)
    if (access.error) {
      const status = access.error === 'workspace_access_denied' ? 403 : 503
      return NextResponse.json({ error: access.error }, { status })
    }

    if (!canChangeWorkspaceAddonActivation(addon, parsed.data.enabled)) {
      return NextResponse.json({ error: 'addon_not_available' }, { status: 409 })
    }

    const { data, error } = await auth.client
      .from('workspace_addon_activations')
      .upsert({
        company_id: parsed.data.workspaceId,
        addon_id: addon.id,
        enabled: parsed.data.enabled,
      }, { onConflict: 'company_id,addon_id' })
      .select('addon_id, enabled')
      .single()

    if (error || !data) throw error ?? new Error('activation_not_persisted')
    return NextResponse.json({ activation: { addonId: data.addon_id, enabled: data.enabled } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[addons] activation write failed', { message: error instanceof Error ? error.message : 'Unknown error' })
    return NextResponse.json({ error: 'addon_activation_failed' }, { status: 503 })
  }
}
