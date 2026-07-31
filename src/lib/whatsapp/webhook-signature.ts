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

  const rawSecrets = [metaSecret, ycloudSecret].filter(Boolean) as string[]

  if (rawSecrets.length === 0) {
    return true
  }

  if (!signatureHeader) {
    return false
  }

  // Expand secret variants (e.g. whsec_ prefix stripped or included)
  const secrets: string[] = []
  for (const s of rawSecrets) {
    secrets.push(s)
    if (s.startsWith('whsec_')) {
      secrets.push(s.slice(6))
    } else {
      secrets.push(`whsec_${s}`)
    }
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
    return false
  }

  if (!rawSig || (rawSig.length !== 64 && !isMetaFormat)) {
    // Standard HMAC-SHA256 hex signatures are 64 characters
    if (rawSig.length !== 64) return false
  }

  for (const secret of secrets) {
    // 1. Direct rawBody HMAC (Meta / YCloud direct)
    const expectedMetaHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    if (rawSig.toLowerCase() === expectedMetaHex.toLowerCase()) {
      return true
    }

    // 2. Timestamp + rawBody HMAC (YCloud style: "${timestamp}.${rawBody}")
    if (timestamp) {
      const payloadToSign = `${timestamp}.${rawBody}`
      const expectedYCloudHex = crypto.createHmac('sha256', secret).update(payloadToSign).digest('hex')
      if (rawSig.toLowerCase() === expectedYCloudHex.toLowerCase()) {
        return true
      }
    }
  }

  return false
}


