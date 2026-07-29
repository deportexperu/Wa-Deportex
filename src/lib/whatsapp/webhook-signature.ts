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
    console.error('[webhook] Neither META_APP_SECRET nor YCLOUD_WEBHOOK_SECRET is set — rejecting request.')
    return false
  }

  // If no signature header is provided, check if in dev mode or bypass if strictly required
  if (!signatureHeader) {
    // If request comes from a trusted endpoint or dry run
    return false
  }

  // Extract raw signature hash
  let rawSig = signatureHeader
  if (signatureHeader.includes('sha256=')) {
    rawSig = signatureHeader.split('sha256=')[1]
  } else if (signatureHeader.includes('v1=')) {
    // YCloud format: t=timestamp,v1=signature
    const parts = signatureHeader.split(',')
    const v1Part = parts.find((p) => p.startsWith('v1='))
    if (v1Part) rawSig = v1Part.replace('v1=', '')
  }

  for (const secret of secrets) {
    const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    
    // Check against expected hex or sha256= prefix
    const expectedPrefixed = `sha256=${expectedHex}`

    if (
      signatureHeader === expectedPrefixed ||
      rawSig === expectedHex ||
      signatureHeader.includes(expectedHex)
    ) {
      return true
    }
  }

  return false
}

