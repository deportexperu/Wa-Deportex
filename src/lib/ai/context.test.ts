import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildConversationContext } from './context'

/** Minimal fake matching the query chain in buildConversationContext:
 *  from().select().eq().eq().order().limit() → { data, error }. */
function fakeDb(rows: unknown[]): SupabaseClient {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  }
  return chain as unknown as SupabaseClient
}

describe('buildConversationContext', () => {
  it('maps sender_type to role and returns chronological order', async () => {
    // DB returns newest-first (created_at DESC); the fn reverses it.
    const rows = [
      { sender_type: 'customer', content_type: 'text', content_text: 'third' },
      { sender_type: 'agent', content_type: 'text', content_text: 'second' },
      { sender_type: 'customer', content_type: 'text', content_text: 'first' },
    ]
    const out = await buildConversationContext(fakeDb(rows), 'conv-1')
    expect(out).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'third' },
    ])
  })

  it('treats bot and agent messages as assistant', async () => {
    const out = await buildConversationContext(
      fakeDb([
        { sender_type: 'agent', content_type: 'text', content_text: 'Si tenemos telas' },
        { sender_type: 'bot', content_type: 'text', content_text: 'auto reply' },
      ]),
      'conv-1',
    )
    expect(out).toEqual([
      { role: 'assistant', content: 'auto reply' },
      { role: 'assistant', content: 'Si tenemos telas' },
    ])
  })

  it('formats multimedia messages with descriptive tags', async () => {
    const rows = [
      { sender_type: 'customer', content_type: 'image', content_text: 'Tienes esta tela?' },
      { sender_type: 'agent', content_type: 'image', content_text: null },
      { sender_type: 'customer', content_type: 'audio', content_text: null },
      { sender_type: 'agent', content_type: 'document', content_text: 'catalogo.pdf' },
    ]
    const out = await buildConversationContext(fakeDb(rows), 'conv-1')
    expect(out).toEqual([
      { role: 'assistant', content: '[Documento: catalogo.pdf]' },
      { role: 'user', content: '[Audio / Mensaje de voz]' },
      { role: 'assistant', content: '[Imagen]' },
      { role: 'user', content: '[Imagen: Tienes esta tela?]' },
    ])
  })

  it('drops empty / whitespace-only text messages with no type label', async () => {
    const out = await buildConversationContext(
      fakeDb([
        { sender_type: 'customer', content_type: 'text', content_text: '   ' },
        { sender_type: 'customer', content_type: 'text', content_text: null },
        { sender_type: 'customer', content_type: 'text', content_text: 'real' },
      ]),
      'conv-1',
    )
    expect(out).toEqual([{ role: 'user', content: 'real' }])
  })
})
