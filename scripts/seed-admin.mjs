import { createClient } from '@supabase/supabase-js';

const url = 'https://costanyfhyclgtueeany.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvc3RhbnlmaHljbGd0dWVlYW55Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTI5NTQ4NCwiZXhwIjoyMTAwODcxNDg0fQ.tlA6Vi8SdN1LTVpTJP04c2d0CYmek9kWtaFabUtel3g';

const supabase = createClient(url, serviceKey);

async function main() {
  const email = 'gianvela@deportex.pe';
  const password = 'gv1988';
  const username = 'gianvela';

  console.log(`Checking/Creating admin user: ${username} (${email})...`);

  // Check if user exists
  const { data: users, error: listErr } = await supabase.auth.admin.listUsers();
  
  if (listErr) {
    console.error("Error listing users:", listErr.message);
    return;
  }

  const existingUser = users.users.find(u => u.email === email || u.user_metadata?.username === username);

  if (existingUser) {
    console.log("Admin user already exists. Updating password...");
    const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      { password: password, email_confirm: true }
    );
    if (updateErr) console.error("Error updating user:", updateErr.message);
    else console.log("User updated successfully!");
  } else {
    console.log("Creating new admin user...");
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { username: username, full_name: 'Gian Vela (Administrador)' }
    });
    if (createErr) console.error("Error creating user:", createErr.message);
    else console.log("New user created successfully! ID:", newUser.user.id);
  }
}

main();
