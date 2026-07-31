import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { findExistingContact } from '@/lib/contacts/dedupe'

// Lazy-initialized service role client
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
 * POST /api/whatsapp/sync
 *
 * Synchronizes messages and contacts directly from YCloud / Meta Cloud API.
 * Pulls recent inbound & outbound messages (including those sent from WhatsApp Web
 * or mobile phone) and stores them in the CRM database.
 */
export async function POST() {
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

    const { data: config, error: configError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError || !config) {
      return NextResponse.json({ error: 'No WhatsApp configuration found' }, { status: 404 })
    }

    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch {
      return NextResponse.json({ error: 'Failed to decrypt access token' }, { status: 500 })
    }

    const displayPhone = (config.phone_number_id || '').replace(/\D/g, '')
    let syncedMessagesCount = 0
    let syncedContactsCount = 0

    // Try fetching from YCloud API directly
    try {
      const ycloudRes = await fetch('https://api.ycloud.com/v1/whatsapp/messages?page=1&limit=100', {
        headers: {
          'X-API-Key': accessToken,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (ycloudRes.ok) {
        const data = await ycloudRes.json()
        const items = Array.isArray(data.items) ? data.items : (Array.isArray(data.data) ? data.data : [])

        for (const item of items) {
          const rawFrom = item.from || item.sender || item.customer?.phone || ''
          const rawTo = item.to || item.recipient || item.destination || ''
          const cleanFrom = normalizePhone(rawFrom)
          const cleanTo = normalizePhone(rawTo)
          const msgId = item.id || `sync_${Date.now()}`

          if (!cleanFrom && !cleanTo) continue

            // Determine direction
            const isOutbound =
              Boolean(item.direction === 'outbound') ||
              Boolean(cleanFrom && displayPhone && (cleanFrom === displayPhone || cleanFrom.endsWith(displayPhone) || displayPhone.endsWith(cleanFrom))) ||
              (Boolean(cleanTo) && cleanFrom !== cleanTo)

            const targetCustomerPhone = isOutbound ? cleanTo : cleanFrom
            if (!targetCustomerPhone || targetCustomerPhone === displayPhone) continue

            // 1. Check if message exists
            const { data: existing } = await supabaseAdmin()
              .from('messages')
              .select('id')
              .eq('message_id', msgId)
              .maybeSingle()

            if (existing) continue

            // 2. Find or create contact
            const contactOutcome = await findOrCreateContact(
              accountId,
              config.user_id,
              targetCustomerPhone,
              item.customer?.name || item.recipientName || targetCustomerPhone
            )
            if (!contactOutcome) continue
            if (contactOutcome.wasCreated) syncedContactsCount++
            const contact = contactOutcome.contact

            // 3. Find or create conversation
            const convResult = await findOrCreateConversation(
              accountId,
              config.user_id,
              contact.id
            )
            if (!convResult) continue
            const conversation = convResult.conversation

            // 4. Content parsing
            let contentType = 'text'
            let contentText: string | null = null
            if (typeof item.text === 'string') contentText = item.text
            else if (typeof item.text === 'object') contentText = item.text?.body || null
            else if (item.body) contentText = String(item.body)

            if (item.image) { contentType = 'image'; contentText = item.image.caption || contentText }
            else if (item.video) { contentType = 'video'; contentText = item.video.caption || contentText }
            else if (item.document) { contentType = 'document'; contentText = item.document.filename || item.document.caption || contentText }
            else if (item.audio) { contentType = 'audio' }

            const mediaUrl = item.image?.url || item.video?.url || item.document?.url || item.audio?.url || null

            // 5. Insert message
            const senderType = isOutbound ? 'agent' : 'customer'
            const { error: msgErr } = await supabaseAdmin().from('messages').insert({
              conversation_id: conversation.id,
              sender_type: senderType,
              content_type: contentType,
              content_text: contentText,
              media_url: mediaUrl,
              message_id: msgId,
              status: item.status || (isOutbound ? 'sent' : 'delivered'),
              created_at: safeIsoTimestamp(item.sendTime || item.createTime || item.timestamp),
            })

            if (!msgErr) {
              syncedMessagesCount++
              // Update conversation preview
              const updateData: Record<string, unknown> = {
                last_message_text: contentText || `[${contentType}]`,
                last_message_at: safeIsoTimestamp(item.sendTime || item.createTime || item.timestamp),
                updated_at: new Date().toISOString(),
              }
              if (isOutbound) {
                updateData.unread_count = 0
              }
              await supabaseAdmin()
                .from('conversations')
                .update(updateData)
                .eq('id', conversation.id)
            }
          }
        }
      } catch (err) {
        console.error('[whatsapp/sync] YCloud sync error:', err)
      }

    return NextResponse.json({
      success: true,
      syncedMessagesCount,
      syncedContactsCount,
    })
  } catch (error) {
    console.error('Error in WhatsApp sync route:', error)
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
  contactId: string,
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
