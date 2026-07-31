const crypto = require('crypto');

// Web Push sender - VAPID signing (RFC 8292) + payload encryption (RFC 8291).
//
// Hand-rolled rather than pulling the `web-push` package for one honest reason:
// this project deploys to Vercel Hobby, where every dependency inflates the
// serverless bundle, and the whole job is ~120 lines of Node crypto that ships
// in the runtime already. Everything here follows the RFCs literally; the
// tricky parts are commented because they are easy to get subtly wrong and the
// failure mode is a push that silently never arrives.

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (str) =>
  Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// --- VAPID: proves to the push service which application server we are -------

// The private key arrives as 32 raw bytes (base64url). Node needs it as a JWK
// to sign, and the JWK also needs the matching public coordinates - so derive
// them from the public key we already ship.
function privateKeyToJwk(privateB64, publicB64) {
  const pub = fromB64url(publicB64); // 0x04 || X(32) || Y(32)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID public key must be 65 uncompressed bytes');
  }
  return crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: privateB64,
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

// ECDSA signatures come out of Node in DER; JWS (ES256) wants the raw r||s pair.
function derToRaw(der) {
  let offset = 3;
  const rLen = der[offset];
  offset += 1;
  let r = der.subarray(offset, offset + rLen);
  offset += rLen + 1;
  const sLen = der[offset];
  offset += 1;
  let s = der.subarray(offset, offset + sLen);

  // DER strips leading zeros and may add one to keep the value positive; JWS
  // needs both halves at exactly 32 bytes.
  const pad = (b) => {
    if (b.length > 32) return b.subarray(b.length - 32);
    if (b.length < 32) return Buffer.concat([Buffer.alloc(32 - b.length), b]);
    return b;
  };
  return Buffer.concat([pad(r), pad(s)]);
}

function vapidHeaders(endpoint, { publicKey, privateKey, subject }) {
  const audience = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(
    JSON.stringify({
      aud: audience,
      // 12 hours. The spec caps this at 24h; push services reject anything
      // longer, and a short-lived token limits replay if it ever leaks.
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: subject,
    })
  );
  const signingInput = `${header}.${payload}`;
  const der = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKeyToJwk(privateKey, publicKey),
    dsaEncoding: 'der',
  });
  const jwt = `${signingInput}.${b64url(derToRaw(der))}`;
  return { Authorization: `vapid t=${jwt}, k=${publicKey}` };
}

// --- Payload encryption (aes128gcm, RFC 8291) --------------------------------

function hkdf(salt, ikm, info, length) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  return crypto
    .createHmac('sha256', prk)
    .update(Buffer.concat([info, Buffer.from([0x01])]))
    .digest()
    .subarray(0, length);
}

function encryptPayload(plaintext, clientPublicB64, authSecretB64) {
  const clientPublic = fromB64url(clientPublicB64);
  const authSecret = fromB64url(authSecretB64);

  // Ephemeral key pair for THIS message. Reusing one across messages would
  // leak the shared secret across recipients.
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(clientPublic);

  // Per RFC 8291 §3.3 the key_info binds both public keys into the derivation,
  // in the order: client (ua) first, then server (as).
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    clientPublic,
    serverPublic,
  ]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

  // aes128gcm requires a padding delimiter byte (0x02 = last record).
  const padded = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  // Header: salt(16) || rs(4, big-endian) || idlen(1) || server public key
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(serverPublic.length, 20);

  return Buffer.concat([header, serverPublic, body]);
}

/**
 * Sends one notification.
 * Returns { ok, status, gone } - `gone` is true for 404/410, which is the push
 * service telling us this endpoint is dead (app uninstalled, permission
 * revoked). The caller MUST delete those rows: retrying a dead endpoint forever
 * burns quota and eventually gets the whole origin rate-limited.
 */
async function sendPush(subscription, data) {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:contato@naturelensapp.cloud';

  if (!publicKey || !privateKey) {
    return { ok: false, status: 0, gone: false, error: 'VAPID keys not configured' };
  }

  try {
    const body = encryptPayload(JSON.stringify(data), subscription.p256dh, subscription.auth);
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        ...vapidHeaders(subscription.endpoint, { publicKey, privateKey, subject }),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: 'normal',
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    return {
      ok: response.ok,
      status: response.status,
      gone: response.status === 404 || response.status === 410,
    };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: e.message };
  }
}

module.exports = { sendPush };
