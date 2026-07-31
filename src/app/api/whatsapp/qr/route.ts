import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  generateQrSession,
  checkQrSessionStatus,
  disconnectQrSession,
} from '@/lib/whatsapp/qr-gateway'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveAccountId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

/**
 * GET /api/whatsapp/qr
 *
 * Returns current QR session status and QR Code image payload for the account.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'Account not found' }, { status: 403 })
    }

    const { data: config } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    const instanceName = config?.instance_name || `acc_${accountId.slice(0, 8)}_${Date.now()}`

    // If QR code is saved or requested
    const qrState = await generateQrSession(instanceName, config?.gateway_url)

    // Save instance name if not set
    if (!config?.instance_name) {
      await supabaseAdmin()
        .from('whatsapp_config')
        .upsert(
          {
            account_id: accountId,
            user_id: user.id,
            connection_type: 'qr_code',
            instance_name: instanceName,
            qr_code_data: qrState.qrCode || null,
            session_status: qrState.status,
            phone_number_id: config?.phone_number_id || 'qr_mode',
            access_token: config?.access_token || 'qr_token',
          },
          { onConflict: 'account_id' }
        )
    }

    return NextResponse.json({
      connected: qrState.status === 'connected',
      sessionStatus: qrState.status,
      qrCodeData: qrState.qrCode || config?.qr_code_data || null,
      instanceName,
      phone: qrState.phone,
    })
  } catch (error) {
    console.error('Error in GET /api/whatsapp/qr:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/whatsapp/qr
 *
 * Actions:
 *   action: 'generate'   -> Generate/Refresh QR Code
 *   action: 'disconnect' -> Disconnect linked device session
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'Account not found' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const action = body.action || 'generate'

    const { data: config } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    const instanceName = config?.instance_name || `acc_${accountId.slice(0, 8)}`

    if (action === 'disconnect') {
      await disconnectQrSession(instanceName, config?.gateway_url)

      await supabaseAdmin()
        .from('whatsapp_config')
        .update({
          connection_type: 'qr_code',
          session_status: 'disconnected',
          qr_code_data: null,
          status: 'disconnected',
        })
        .eq('account_id', accountId)

      return NextResponse.json({ success: true, message: 'Dispositivo desvinculado correctamente.' })
    }

    // Default: generate / refresh QR Code
    const qrState = await generateQrSession(instanceName, config?.gateway_url)

    await supabaseAdmin()
      .from('whatsapp_config')
      .upsert(
        {
          account_id: accountId,
          user_id: user.id,
          connection_type: 'qr_code',
          instance_name: instanceName,
          qr_code_data: qrState.qrCode || null,
          session_status: qrState.status,
          phone_number_id: config?.phone_number_id || 'qr_mode',
          access_token: config?.access_token || 'qr_token',
        },
        { onConflict: 'account_id' }
      )

    return NextResponse.json({
      success: true,
      sessionStatus: qrState.status,
      qrCodeData: qrState.qrCode,
      instanceName,
    })
  } catch (error) {
    console.error('Error in POST /api/whatsapp/qr:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
