import { NextResponse } from 'next/server'
import { formatApiError, requireOwnedCompany } from '@/app/api/woocommerce/_utils'
import { getWhatsAppPlatformConfig, getWhatsAppWebhookUrl } from '@/lib/whatsapp-business'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const companyId = new URL(request.url).searchParams.get('companyId') ?? ''
    const auth = await requireOwnedCompany(companyId)
    if ('error' in auth) return auth.error

    const config = getWhatsAppPlatformConfig()

    return NextResponse.json({
      appId: config.appId,
      configId: config.configId,
      graphVersion: config.graphVersion,
      webhookUrl: getWhatsAppWebhookUrl(),
    })
  } catch (error) {
    return NextResponse.json({ error: formatApiError(error) }, { status: 500 })
  }
}
