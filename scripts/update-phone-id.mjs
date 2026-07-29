import { createClient } from '@supabase/supabase-js';

const url = 'https://costanyfhyclgtueeany.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvc3RhbnlmaHljbGd0dWVlYW55Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTI5NTQ4NCwiZXhwIjoyMTAwODcxNDg0fQ.tlA6Vi8SdN1LTVpTJP04c2d0CYmek9kWtaFabUtel3g';

const supabase = createClient(url, serviceKey);

async function run() {
  console.log("Updating whatsapp_config phone_number_id and registered_at...");
  const { data, error } = await supabase
    .from('whatsapp_config')
    .update({ 
      status: 'connected', 
      registered_at: new Date().toISOString() 
    })
    .eq('user_id', '6b692982-311d-48ae-a663-e93ba0c1885e');

  if (error) {
    console.error("Error updating config:", error.message);
  } else {
    console.log("Successfully updated whatsapp_config status and registered_at!");
  }
}

run();
