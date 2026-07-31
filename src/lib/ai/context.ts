import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './types'
import { aiContextMessageLimit } from './defaults'

interface DbMessage {
  sender_type: 'customer' | 'agent' | 'bot'
  content_type?: string | null
  content_text: string | null
}

function formatMessageContent(m: DbMessage): string | null {
  const text = m.content_text?.trim() ?? ''
  const type = m.content_type ?? 'text'

  switch (type) {
    case 'text':
      return text || null
    case 'image':
      return text ? `[Imagen: ${text}]` : '[Imagen]'
    case 'video':
      return text ? `[Video: ${text}]` : '[Video]'
    case 'document':
      return text ? `[Documento: ${text}]` : '[Documento]'
    case 'audio':
      return text ? `[Audio / Mensaje de voz: ${text}]` : '[Audio / Mensaje de voz]'
    case 'location':
      return text ? `[Ubicación: ${text}]` : '[Ubicación]'
    case 'template':
      return text ? `[Plantilla: ${text}]` : '[Plantilla]'
    case 'interactive':
      return text ? `[Opción seleccionada: ${text}]` : '[Respuesta interactiva]'
    default:
      return text || (type ? `[${type}]` : null)
  }
}

/**
 * Fetch the last N messages of a conversation and map them to the
 * provider-neutral chat shape. Customer messages become `user`; agent
 * (from App, Web, or CRM) and bot messages become `assistant`.
 *
 * Both text and multimedia messages (images, documents, voice notes, etc.)
 * are included so the AI has complete thread context.
 *
 * Ordered oldest-first (chronological) so the transcript reads
 * naturally and the most recent customer message lands last.
 */
export async function buildConversationContext(
  db: SupabaseClient,
  conversationId: string,
  limit: number = aiContextMessageLimit(),
): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from('messages')
    .select('sender_type, content_type, content_text')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const rows = ((data ?? []) as DbMessage[]).reverse()
  const result: ChatMessage[] = []

  for (const m of rows) {
    const content = formatMessageContent(m)
    if (!content) continue
    result.push({
      role: m.sender_type === 'customer' ? 'user' : 'assistant',
      content,
    })
  }

  return result
}
