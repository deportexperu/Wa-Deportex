import { createClient } from '@supabase/supabase-js';

const url = 'https://costanyfhyclgtueeany.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvc3RhbnlmaHljbGd0dWVlYW55Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTI5NTQ4NCwiZXhwIjoyMTAwODcxNDg0fQ.tlA6Vi8SdN1LTVpTJP04c2d0CYmek9kWtaFabUtel3g';

const supabase = createClient(url, serviceKey);

async function check() {
  console.log("Checking Supabase connection...");
  const { data, error } = await supabase.from('profiles').select('count', { count: 'exact' });
  if (error) {
    console.log("Error selecting from profiles:", error.message, error.code);
  } else {
    console.log("Profiles table exists! Count:", data);
  }
}

check();
