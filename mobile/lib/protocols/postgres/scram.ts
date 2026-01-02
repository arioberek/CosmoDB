const SHA256_BLOCK_SIZE = 64;
const SHA256_OUTPUT_SIZE = 32;
const GS2_HEADER = "n,,";

export type ScramSession = {
  clientNonce: string;
  clientFirstMessageBare: string;
  clientFirstMessage: string;
  expectedServerSignature?: string;
};

type ScramAttributes = Record<string, string>;

const SHA256_K = [
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2,
];

const SHA256_INIT = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
];

function utf8ToBytes(input: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(input);
  }

  const encoded = encodeURIComponent(input);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const char = encoded.charAt(i);
    if (char === "%") {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return new Uint8Array(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(input: string): Uint8Array {
  return Uint8Array.from(Buffer.from(input, "base64"));
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] ^ b[i];
  }
  return out;
}

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256(bytes: Uint8Array): Uint8Array {
  const bitLen = bytes.length * 8;
  const totalLen = ((bytes.length + 9 + 63) & ~63) >>> 0;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 4, bitLen >>> 0, false);
  view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);

  const h = SHA256_INIT.slice();
  const w = new Uint32Array(64);

  for (let i = 0; i < totalLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 64; j++) {
      const s0 =
        rotr(w[j - 15], 7) ^
        rotr(w[j - 15], 18) ^
        (w[j - 15] >>> 3);
      const s1 =
        rotr(w[j - 2], 17) ^
        rotr(w[j - 2], 19) ^
        (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let h0 = h[7];

    for (let j = 0; j < 64; j++) {
      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t1 = (h0 + s1 + ch + SHA256_K[j] + w[j]) >>> 0;
      const t2 = (s0 + maj) >>> 0;

      h0 = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + h0) >>> 0;
  }

  const out = new Uint8Array(SHA256_OUTPUT_SIZE);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < h.length; i++) {
    outView.setUint32(i * 4, h[i], false);
  }
  return out;
}

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  let normalizedKey = key;
  if (normalizedKey.length > SHA256_BLOCK_SIZE) {
    normalizedKey = sha256(normalizedKey);
  }

  const block = new Uint8Array(SHA256_BLOCK_SIZE);
  block.set(normalizedKey);

  const oKeyPad = new Uint8Array(SHA256_BLOCK_SIZE);
  const iKeyPad = new Uint8Array(SHA256_BLOCK_SIZE);

  for (let i = 0; i < SHA256_BLOCK_SIZE; i++) {
    const byte = block[i];
    oKeyPad[i] = byte ^ 0x5c;
    iKeyPad[i] = byte ^ 0x36;
  }

  const inner = sha256(concatBytes(iKeyPad, message));
  return sha256(concatBytes(oKeyPad, inner));
}

function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLen: number
): Uint8Array {
  const blocksNeeded = Math.ceil(keyLen / SHA256_OUTPUT_SIZE);
  const output = new Uint8Array(blocksNeeded * SHA256_OUTPUT_SIZE);

  for (let blockIndex = 1; blockIndex <= blocksNeeded; blockIndex++) {
    const blockSalt = new Uint8Array(salt.length + 4);
    blockSalt.set(salt, 0);
    blockSalt[salt.length] = (blockIndex >>> 24) & 0xff;
    blockSalt[salt.length + 1] = (blockIndex >>> 16) & 0xff;
    blockSalt[salt.length + 2] = (blockIndex >>> 8) & 0xff;
    blockSalt[salt.length + 3] = blockIndex & 0xff;

    let u = hmacSha256(password, blockSalt);
    let t = new Uint8Array(u);

    for (let i = 1; i < iterations; i++) {
      u = hmacSha256(password, u);
      for (let j = 0; j < t.length; j++) {
        t[j] ^= u[j];
      }
    }

    output.set(t, (blockIndex - 1) * SHA256_OUTPUT_SIZE);
  }

  return output.slice(0, keyLen);
}

function generateNonce(byteLength = 18): string {
  const bytes = new Uint8Array(byteLength);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToBase64(bytes).replace(/=+$/g, "");
}

function scramEscape(value: string): string {
  return value.replace(/=/g, "=3D").replace(/,/g, "=2C");
}

function parseScramAttributes(message: string): ScramAttributes {
  const attributes: ScramAttributes = {};
  const parts = message.split(",");
  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    if (!key || rest.length === 0) continue;
    attributes[key] = rest.join("=");
  }
  return attributes;
}

export function startScramSession(username: string): ScramSession {
  const clientNonce = generateNonce();
  const clientFirstMessageBare = `n=${scramEscape(username)},r=${clientNonce}`;
  const clientFirstMessage = `${GS2_HEADER}${clientFirstMessageBare}`;

  return {
    clientNonce,
    clientFirstMessageBare,
    clientFirstMessage,
  };
}

export function buildScramClientFinal(
  session: ScramSession,
  password: string,
  serverFirstMessage: string
): { clientFinalMessage: string; serverSignature: string } {
  const attrs = parseScramAttributes(serverFirstMessage);
  const nonce = attrs.r;
  const salt = attrs.s;
  const iterations = attrs.i;

  if (!nonce || !salt || !iterations) {
    throw new Error("Invalid SCRAM server-first message");
  }
  if (!nonce.startsWith(session.clientNonce)) {
    throw new Error("Invalid SCRAM nonce");
  }

  const saltBytes = base64ToBytes(salt);
  const iterationCount = parseInt(iterations, 10);
  if (!Number.isFinite(iterationCount) || iterationCount <= 0) {
    throw new Error("Invalid SCRAM iteration count");
  }

  const passwordBytes = utf8ToBytes(password);
  const saltedPassword = pbkdf2Sha256(
    passwordBytes,
    saltBytes,
    iterationCount,
    SHA256_OUTPUT_SIZE
  );

  const clientKey = hmacSha256(saltedPassword, utf8ToBytes("Client Key"));
  const storedKey = sha256(clientKey);
  const channelBinding = bytesToBase64(utf8ToBytes(GS2_HEADER));
  const clientFinalWithoutProof = `c=${channelBinding},r=${nonce}`;
  const authMessage = `${session.clientFirstMessageBare},${serverFirstMessage},${clientFinalWithoutProof}`;
  const clientSignature = hmacSha256(storedKey, utf8ToBytes(authMessage));
  const clientProof = bytesToBase64(xorBytes(clientKey, clientSignature));

  const serverKey = hmacSha256(saltedPassword, utf8ToBytes("Server Key"));
  const serverSignature = bytesToBase64(
    hmacSha256(serverKey, utf8ToBytes(authMessage))
  );

  const clientFinalMessage = `${clientFinalWithoutProof},p=${clientProof}`;

  return { clientFinalMessage, serverSignature };
}

export function verifyScramServerFinal(
  session: ScramSession,
  serverFinalMessage: string
): void {
  const attrs = parseScramAttributes(serverFinalMessage);
  if (attrs.e) {
    throw new Error(attrs.e);
  }

  const serverSignature = attrs.v;
  if (!serverSignature || !session.expectedServerSignature) {
    throw new Error("Invalid SCRAM server-final message");
  }

  if (serverSignature !== session.expectedServerSignature) {
    throw new Error("SCRAM server signature mismatch");
  }
}
