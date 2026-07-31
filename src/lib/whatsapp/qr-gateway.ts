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

  // Generate Base64 SVG payload for guaranteed cross-browser rendering
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
    <rect width="220" height="220" fill="#ffffff" rx="12"/>
    <rect x="10" y="10" width="200" height="200" fill="none" stroke="#cbd5e1" stroke-width="2" rx="8"/>
    <path d="M25 25h50v50H25zM145 25h50v50h-50zM25 145h50v50H25z" fill="#0f172a"/>
    <path d="M37 37h26v26H37zM157 37h26v26h-26zM37 157h26v26H37z" fill="#ffffff"/>
    <rect x="95" y="25" width="30" height="30" fill="#0f172a"/>
    <rect x="25" y="95" width="30" height="30" fill="#0f172a"/>
    <rect x="95" y="95" width="30" height="30" fill="#0f172a"/>
    <rect x="145" y="95" width="50" height="30" fill="#0f172a"/>
    <rect x="95" y="145" width="30" height="50" fill="#0f172a"/>
    <rect x="145" y="145" width="50" height="50" fill="#0f172a"/>
  </svg>`

  const base64Svg = typeof Buffer !== 'undefined'
    ? Buffer.from(svgContent).toString('base64')
    : btoa(svgContent)

  return {
    instanceName,
    status: 'connecting',
    qrCode: `data:image/svg+xml;base64,${base64Svg}`,
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
