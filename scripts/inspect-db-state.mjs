import { createClient } from '@supabase/supabase-js';

const url = 'https://costanyfhyclgtueeany.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvc3RhbnlmaHljbGd0dWVlYW55Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTI5NTQ4NCwiZXhwIjoyMTAwODcxNDg0fQ.tlA6Vi8SdN1LTVpTJP04c2d0CYmek9kWtaFabUtel3g';

const supabase = createClient(url, serviceKey);

async function check() {
  console.log("=== INSPECTING SUPABASE DB STATE ===");

  const { data: configs, error: cfgErr } = await supabase.from('whatsapp_config').select('*');
  console.log("whatsapp_config rows:", configs, "Error:", cfgErr?.message);

  const { data: profiles, error: prfErr } = await supabase.from('profiles').select('*');
  console.log("profiles rows:", profiles, "Error:", prfErr?.message);

  const { data: accounts, error: accErr } = await supabase.from('accounts').select('*');
  console.log("accounts rows:", accounts, "Error:", accErr?.message);

  const { data: contacts, error: cntErr } = await supabase.from('contacts').select('*');
  console.log("contacts rows:", contacts, "Error:", cntErr?.message);

  const { data: conversations, error: cnvErr } = await supabase.from('conversations').select('*');
  console.log("conversations rows:", conversations, "Error:", cnvErr?.message);

  const { data: messages, error: msgErr } = await supabase.from('messages').select('*');
  console.log("messages rows:", messages, "Error:", msgErr?.message);
}

check();
