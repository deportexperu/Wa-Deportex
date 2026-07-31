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
  const ycloudSecret = process.env.YCLOUD_WEBHOOK_SECRET

  const secrets = [metaSecret, ycloudSecret].filter(Boolean) as string[]

  if (secrets.length === 0) {
    return false
  }

  if (!signatureHeader) {
    return false
  }

  let timestamp = ''
  let rawSig = signatureHeader
  let isMetaFormat = false

  if (signatureHeader.startsWith('sha256=')) {
    rawSig = signatureHeader.slice(7)
    isMetaFormat = true
  } else if (signatureHeader.includes('v1=')) {
    const parts = signatureHeader.split(',')
    const v1Part = parts.find((p) => p.trim().startsWith('v1='))
    const tPart = parts.find((p) => p.trim().startsWith('t='))
    if (v1Part) rawSig = v1Part.trim().replace('v1=', '')
    if (tPart) timestamp = tPart.trim().replace('t=', '')
  } else {
    // If signatureHeader has an invalid prefix (e.g. sha512= or plain hex without prefix)
    return false
  }

  if (!rawSig || rawSig.length !== 64) {
    return false
  }

  for (const secret of secrets) {
    // 1. Direct rawBody HMAC (Meta style)
    if (isMetaFormat) {
      const expectedMetaHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
      if (rawSig === expectedMetaHex) {
        return true
      }
    }

    // 2. Timestamp + rawBody HMAC (YCloud style: "${timestamp}.${rawBody}")
    if (timestamp) {
      const payloadToSign = `${timestamp}.${rawBody}`
      const expectedYCloudHex = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex')
      if (rawSig === expectedYCloudHex) {
        return true
      }
    }
  }

  return false
}


