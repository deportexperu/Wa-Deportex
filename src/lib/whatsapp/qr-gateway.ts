/**
 * Helper client for managing WhatsApp Web QR Code Gateway connections.
 * Supports generating QR codes, status checking, sending outbound messages,
 * and disconnecting linked WhatsApp sessions.
 */

export interface QrSessionState {
  instanceName: string
  status: 'disconnected' | 'connecting' | 'connected'
  qrCode?: string // Base64 image string or raw payload
  phone?: string
  deviceName?: string
  connectedAt?: string
}

export interface QrSendMessagePayload {
  to: string
  text?: string
  mediaUrl?: string
  mediaType?: 'image' | 'video' | 'document' | 'audio'
  caption?: string
}

/**
 * Generate a new QR Code for pairing WhatsApp Web
 */
export async function generateQrSession(instanceName: string, gatewayUrl?: string): Promise<QrSessionState> {
  const endpoint = gatewayUrl || process.env.WHATSAPP_QR_GATEWAY_URL || 'https://api.ycloud.com/v1/whatsapp/qr'

  try {
    const res = await fetch(`${endpoint}/instance/${instanceName}/qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (res.ok) {
      const data = await res.json()
      return {
        instanceName,
        status: data.status || 'connecting',
        qrCode: data.qrCode || data.qr || data.base64 || undefined,
        phone: data.phone || data.user?.id || undefined,
      }
    }
  } catch (err) {
    console.error('[qr-gateway] Failed to generate QR session:', err)
  }

  // Fallback / Mock representation if external gateway server is initializing
  return {
    instanceName,
    status: 'connecting',
    qrCode: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="%23f8fafc"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%23475569">Escanea con WhatsApp</text><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="11" fill="%2394a3b8">Instancia: ${instanceName.slice(0, 8)}...</text></svg>`,
  }
}

/**
 * Check current status of a QR Gateway session
 */
export async function checkQrSessionStatus(instanceName: string, gatewayUrl?: string): Promise<QrSessionState> {
  const endpoint = gatewayUrl || process.env.WHATSAPP_QR_GATEWAY_URL || 'https://api.ycloud.com/v1/whatsapp/qr'

  try {
    const res = await fetch(`${endpoint}/instance/${instanceName}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (res.ok) {
      const data = await res.json()
      return {
        instanceName,
        status: data.status || 'disconnected',
        phone: data.phone,
        deviceName: data.deviceName || 'WhatsApp Web',
        connectedAt: data.connectedAt,
      }
    }
  } catch (err) {
    console.error('[qr-gateway] Check QR status error:', err)
  }

  return {
    instanceName,
    status: 'disconnected',
  }
}

/**
 * Send an outbound message via QR Gateway session
 */
export async function sendQrMessage(
  instanceName: string,
  payload: QrSendMessagePayload,
  gatewayUrl?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const endpoint = gatewayUrl || process.env.WHATSAPP_QR_GATEWAY_URL || 'https://api.ycloud.com/v1/whatsapp/qr'

  try {
    const res = await fetch(`${endpoint}/instance/${instanceName}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: payload.to,
        text: payload.text,
        mediaUrl: payload.mediaUrl,
        mediaType: payload.mediaType,
        caption: payload.caption,
      }),
    })

    if (res.ok) {
      const data = await res.json()
      return {
        success: true,
        messageId: data.messageId || data.id || `qr_${Date.now()}`,
      }
    }

    const errData = await res.json().catch(() => ({}))
    return {
      success: false,
      error: errData.error || errData.message || `HTTP ${res.status}`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return { success: false, error: msg }
  }
}

/**
 * Disconnect and logout a QR Gateway instance session
 */
export async function disconnectQrSession(instanceName: string, gatewayUrl?: string): Promise<boolean> {
  const endpoint = gatewayUrl || process.env.WHATSAPP_QR_GATEWAY_URL || 'https://api.ycloud.com/v1/whatsapp/qr'

  try {
    const res = await fetch(`${endpoint}/instance/${instanceName}/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    return res.ok
  } catch (err) {
    console.error('[qr-gateway] Logout failed:', err)
    return false
  }
}
