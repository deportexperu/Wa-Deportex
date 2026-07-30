import crypto from 'crypto';

const LOCAL_URL = 'http://localhost:3000/api/whatsapp/webhook';
const YCLOUD_SECRET = 'whsec_793fa8f6b8ec421c9bdb29d3572f8e57';

const payload = JSON.stringify({
  "type": "whatsapp.inbound_message.received",
  "whatsappInboundMessage": {
    "id": "wamid.test_local_" + Date.now(),
    "from": "+51982721392",
    "type": "text",
    "text": { "body": "Buenos días" },
    "timestamp": Math.floor(Date.now() / 1000).toString(),
    "customer": { "name": "51982721392", "phone_number": "+51982721392" }
  }
});

const timestamp = Math.floor(Date.now() / 1000).toString();
const signedPayload = `${timestamp}.${payload}`;
const hmac = crypto.createHmac('sha256', YCLOUD_SECRET).update(signedPayload).digest('hex');
const ycloudSig = `t=${timestamp},v1=${hmac}`;

console.log('=== Testing LOCAL URL ===');
console.log('URL:', LOCAL_URL);

try {
  const res = await fetch(LOCAL_URL, {
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
} catch (err) {
  console.error('Fetch error:', err);
}
