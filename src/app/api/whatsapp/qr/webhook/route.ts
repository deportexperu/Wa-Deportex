import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { findExistingContact } from '@/lib/contacts/dedupe'

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

function safeIsoTimestamp(ts: unknown): string {
  if (!ts) return new Date().toISOString()
  if (typeof ts === 'string' && (ts.includes('T') || ts.includes('-'))) {
    const d = new Date(ts)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  const num = Number(ts)
  if (!isNaN(num) && num > 0) {
    const ms = num < 10000000000 ? num * 1000 : num
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  return new Date().toISOString()
}

/**
 * POST /api/whatsapp/qr/webhook
 *
 * Receives real-time events from the QR Web Gateway (Baileys / Evolution API):
 *   - `messages.upsert`: Real-time incoming & outgoing messages from phone/web
 *   - `connection.update`: Connection status changes (open, connecting, close)
 *   - `contacts.upsert`: Saved WhatsApp contacts
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const event = body.event || body.type || ''
    const instance = body.instance || body.instanceName || ''

    if (!instance && !body.data) {
      return NextResponse.json({ status: 'ignored' }, { status: 200 })
    }

    // Resolve whatsapp_config by instance_name or account fallback
    let { data: config } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('*')
      .eq('instance_name', instance)
      .maybeSingle()

    if (!config) {
      const { data: fallback } = await supabaseAdmin()
        .from('whatsapp_config')
        .select('*')
        .eq('connection_type', 'qr_code')
        .maybeSingle()
      config = fallback
    }

    if (!config) {
      return NextResponse.json({ status: 'no_config' }, { status: 200 })
    }

    // Handle connection updates
    if (event === 'connection.update' || body.state) {
      const state = body.state || body.connection || ''
      let sessionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected'
      if (state === 'open' || state === 'connected') sessionStatus = 'connected'
      else if (state === 'connecting') sessionStatus = 'connecting'

      await supabaseAdmin()
        .from('whatsapp_config')
        .update({
          session_status: sessionStatus,
          status: sessionStatus === 'connected' ? 'connected' : 'disconnected',
        })
        .eq('id', config.id)

      return NextResponse.json({ status: 'connection_updated' })
    }

    // Handle message events (messages.upsert / message)
    if (event === 'messages.upsert' || event === 'message' || body.data?.message) {
      const data = body.data || body
      const msg = data.message || data
      const key = msg.key || {}

      const msgId = key.id || msg.id || `qr_${Date.now()}`
      const isFromMe = Boolean(key.fromMe || msg.fromMe)
      const rawRemoteJid = key.remoteJid || msg.remoteJid || msg.from || msg.to || ''
      const cleanPhone = normalizePhone(rawRemoteJid.replace(/@s\.whatsapp\.net|@g\.us/g, ''))

      if (!cleanPhone) {
        return NextResponse.json({ status: 'no_phone' })
      }

      // Check if message already exists
      const { data: existing } = await supabaseAdmin()
        .from('messages')
        .select('id')
        .eq('message_id', msgId)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({ status: 'already_exists' })
      }

      // Resolve/create contact
      const contactOutcome = await findOrCreateContact(
        config.account_id,
        config.user_id,
        cleanPhone,
        msg.pushName || data.pushName || cleanPhone
      )
      if (!contactOutcome) return NextResponse.json({ status: 'contact_failed' })
      const contact = contactOutcome.contact

      // Resolve/create conversation
      const convOutcome = await findOrCreateConversation(
        config.account_id,
        config.user_id,
        contact.id
      )
      if (!convOutcome) return NextResponse.json({ status: 'conversation_failed' })
      const conversation = convOutcome.conversation

      // Content parsing
      let contentType = 'text'
      let contentText: string | null = null
      let mediaUrl: string | null = null

      const conversationMsg = msg.message || {}
      if (conversationMsg.conversation) {
        contentText = conversationMsg.conversation
      } else if (conversationMsg.extendedTextMessage?.text) {
        contentText = conversationMsg.extendedTextMessage.text
      } else if (conversationMsg.imageMessage) {
        contentType = 'image'
        contentText = conversationMsg.imageMessage.caption || null
        mediaUrl = conversationMsg.imageMessage.url || null
      } else if (conversationMsg.videoMessage) {
        contentType = 'video'
        contentText = conversationMsg.videoMessage.caption || null
        mediaUrl = conversationMsg.videoMessage.url || null
      } else if (conversationMsg.documentMessage) {
        contentType = 'document'
        contentText = conversationMsg.documentMessage.filename || conversationMsg.documentMessage.caption || null
        mediaUrl = conversationMsg.documentMessage.url || null
      } else if (conversationMsg.audioMessage) {
        contentType = 'audio'
        mediaUrl = conversationMsg.audioMessage.url || null
      } else if (typeof msg.body === 'string') {
        contentText = msg.body
      }

      const senderType = isFromMe ? 'agent' : 'customer'
      const timestamp = safeIsoTimestamp(msg.messageTimestamp || data.timestamp || String(Math.floor(Date.now() / 1000)))

      // Insert message into database
      const { error: msgErr } = await supabaseAdmin().from('messages').insert({
        conversation_id: conversation.id,
        sender_type: senderType,
        content_type: contentType,
        content_text: contentText,
        media_url: mediaUrl,
        message_id: msgId,
        status: 'sent',
        created_at: timestamp,
      })

      if (!msgErr) {
        const updateData: Record<string, unknown> = {
          last_message_text: contentText || `[${contentType}]`,
          last_message_at: timestamp,
          updated_at: new Date().toISOString(),
        }
        if (isFromMe) {
          updateData.unread_count = 0
        }
        await supabaseAdmin()
          .from('conversations')
          .update(updateData)
          .eq('id', conversation.id)
      }
    }

    return NextResponse.json({ status: 'received' }, { status: 200 })
  } catch (error) {
    console.error('Error processing QR webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function findOrCreateContact(
  accountId: string,
  configOwnerUserId: string,
  phone: string,
  name: string
) {
  const existingContact = await findExistingContact(supabaseAdmin(), accountId, phone)
  if (existingContact) {
    return { contact: existingContact, wasCreated: false }
  }

  const { data: newContact, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      phone,
      name: name || phone,
    })
    .select()
    .single()

  if (createError) {
    const raced = await findExistingContact(supabaseAdmin(), accountId, phone)
    if (raced) return { contact: raced, wasCreated: false }
    return null
  }

  return { contact: newContact, wasCreated: true }
}

async function findOrCreateConversation(
  accountId: string,
  configOwnerUserId: string,
  contactId: string
) {
  const { data: existingRows } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (existingRows && existingRows.length > 0) {
    return { conversation: existingRows[0], created: false }
  }

  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      contact_id: contactId,
    })
    .select()
    .single()

  if (createError) {
    const { data: raced } = await supabaseAdmin()
      .from('conversations')
      .select('*')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(1)
    if (raced && raced.length > 0) {
      return { conversation: raced[0], created: false }
    }
    return null
  }

  return { conversation: newConv, created: true }
}
