/**
 * Sends a real YCloud-style webhook payload to the PRODUCTION Vercel endpoint
 */
import crypto from 'crypto';

const VERCEL_URL = 'https://wa-deportex.vercel.app/api/whatsapp/webhook';
const YCLOUD_SECRET = 'whsec_793fa8f6b8ec421c9bdb29d3572f8e57';

const payload = JSON.stringify({
  "type": "whatsapp.inbound_message.received",
  "whatsappInboundMessage": {
    "id": "wamid.test_prod_123",
    "from": "+51956789012",
    "type": "text",
    "text": { "body": "Hola deportex, prueba de CRM" },
    "timestamp": Math.floor(Date.now() / 1000).toString(),
    "customer": { "name": "Cliente Prueba", "phone_number": "+51956789012" }
  }
});

const timestamp = Math.floor(Date.now() / 1000).toString();
const signedPayload = `${timestamp}.${payload}`;
const hmac = crypto.createHmac('sha256', YCLOUD_SECRET).update(signedPayload).digest('hex');
const ycloudSig = `t=${timestamp},v1=${hmac}`;

console.log('=== Testing PRODUCTION URL ===');
console.log('URL:', VERCEL_URL);

const res = await fetch(VERCEL_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'ycloud-signature': ycloudSig,
  },
  body: payload,
});
const body = await res.text();
console.log('Status:', res.status);
console.log('Response:', body);

if (res.status === 200) {
  console.log('\n✅ SUCCESS - Webhook was accepted by the server!');
  console.log('Check Supabase contacts/conversations tables in ~5 seconds...');
} else {
  console.log('\n❌ FAILED - Server rejected the webhook');
}
