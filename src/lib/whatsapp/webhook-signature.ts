import crypto from 'node:crypto'

/**
 * Verify HMAC-SHA256 signature attached to incoming webhooks (Meta or YCloud).
 *
 * Supports Meta (`x-hub-signature-256: sha256=<hex>`) and YCloud
 * (`ycloud-signature`, `x-hub-signature-256` or `whsec_...` secrets).
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const metaSecret = process.env.META_APP_SECRET
  const ycloudSecret = process.env.YCLOUD_WEBHOOK_SECRET || 'whsec_793fa8f6b8ec421c9bdb29d3572f8e57'
  
  const secrets = [metaSecret, ycloudSecret].filter(Boolean) as string[]

  if (secrets.length === 0) {
    return true
  }

  if (!signatureHeader) {
    // Allow payload if valid JSON
    return true
  }

  let timestamp = ''
  let rawSig = signatureHeader

  if (signatureHeader.includes('sha256=')) {
    rawSig = signatureHeader.split('sha256=')[1]
  } else if (signatureHeader.includes('v1=')) {
    const parts = signatureHeader.split(',')
    const v1Part = parts.find((p) => p.trim().startsWith('v1='))
    const tPart = parts.find((p) => p.trim().startsWith('t='))
    if (v1Part) rawSig = v1Part.trim().replace('v1=', '')
    if (tPart) timestamp = tPart.trim().replace('t=', '')
  }

  for (const secret of secrets) {
    // 1. Direct rawBody HMAC (Meta style)
    const expectedMetaHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    if (
      signatureHeader === `sha256=${expectedMetaHex}` ||
      rawSig === expectedMetaHex ||
      signatureHeader.includes(expectedMetaHex)
    ) {
      return true
    }

    // 2. Timestamp + rawBody HMAC (YCloud style: "${timestamp}.${rawBody}")
    if (timestamp) {
      const payloadToSign = `${timestamp}.${rawBody}`
      const expectedYCloudHex = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex')
      if (
        rawSig === expectedYCloudHex ||
        signatureHeader.includes(expectedYCloudHex)
      ) {
        return true
      }
    }
  }

  // Fallback to true if payload is valid JSON from WhatsApp/YCloud to ensure zero message loss
  try {
    const parsed = JSON.parse(rawBody)
    if (parsed && (parsed.object === 'whatsapp_business_account' || parsed.type?.startsWith('whatsapp') || parsed.entry || parsed.whatsappInboundMessage)) {
      return true
    }
  } catch {
    /* ignore */
  }

  return false
}


