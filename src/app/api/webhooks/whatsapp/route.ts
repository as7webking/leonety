import { handleWhatsAppWebhook, verifyWhatsAppWebhook } from '@/lib/whatsapp-webhook-handler'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return verifyWhatsAppWebhook(request)
}

export async function POST(request: Request) {
  return handleWhatsAppWebhook(request)
}
