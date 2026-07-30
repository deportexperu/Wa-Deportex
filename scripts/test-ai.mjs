import { createClient } from '@supabase/supabase-js'
import { loadAiConfig } from '../src/lib/ai/config.js'
import { buildConversationContext } from '../src/lib/ai/context.js'
import { retrieveKnowledge } from '../src/lib/ai/knowledge.js'
import { buildSystemPrompt } from '../src/lib/ai/defaults.js'
import { generateReply } from '../src/lib/ai/generate.js'
import { latestUserMessage } from '../src/lib/ai/query.js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const accountId = 'bab8b79f-d3a5-4063-bd6c-a7cf7302f63f'
const conversationId = 'cb165354-e153-472d-b6e5-1037a5e2ce80'
const contactId = 'ed1bab43-ad06-4e3b-abd9-228e89664a5e'

async function test() {
  console.log('Starting AI Auto-reply simulation...')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const config = await loadAiConfig(db, accountId)
    console.log('AI Config Loaded:', config ? { ...config, apiKey: '***' } : 'NULL')
    if (!config) return

    const messages = await buildConversationContext(db, conversationId)
    console.log('Conversation Context Messages:', messages)

    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      latestUserMessage(messages)
    )
    console.log('Knowledge retrieved:', knowledge)

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge
    })
    console.log('System Prompt built. Length:', systemPrompt.length)

    console.log('Generating reply from provider...')
    const result = await generateReply({
      config,
      systemPrompt,
      messages
    })
    console.log('AI Generation Result:', result)
  } catch (err) {
    console.error('Error during AI simulation:', err)
  }
}

test()
