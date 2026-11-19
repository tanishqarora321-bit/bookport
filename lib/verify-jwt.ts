// Verifies a Supabase access token's signature locally (Web Crypto - works
// in middleware / Edge) instead of asking Supabase's Auth server on every
// request (owner, 2026-11: "make it superfast"). That network round trip
// used to sit in front of every page and every API call.
//
//   - ES256 / RS256 (Supabase signing keys): the project's public keys from
//     <SUPABASE_URL>/auth/v1/.well-known/jwks.json, fetched once and cached.
//   - HS256 (legacy shared secret): verified when SUPABASE_JWT_SECRET is set.
//
// Returns the verified claims, or `null` whenever it can't PROVE the token
// good here (unknown key, no secret, bad signature, expired...) - the caller
// then falls back to supabase.auth.getUser(), exactly as before. Only a
// positive result is trusted, so this can never lock anyone out.
export type VerifiedClaims = { sub: string; email: string | null };

type Jwk = JsonWebKey & { kid?: string; alg?: string };
let jwksCache: { keys: Jwk[]; at: number } | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000;

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function decodeJson(part: string): any {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

async function getJwks(supabaseUrl: string, forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`, { cache: "no-store" });
    if (!res.ok) return jwksCache?.keys ?? [];
    const json = await res.json();
    jwksCache = { keys: Array.isArray(json?.keys) ? json.keys : [], at: Date.now() };
  } catch {
    return jwksCache?.keys ?? [];
  }
  return jwksCache.keys;
}

export async function verifySupabaseJwt(token: string, supabaseUrl: string): Promise<VerifiedClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: any;
  let payload: any;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    return null;
  }
  if (!payload?.sub) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = b64urlToBytes(parts[2]);
  let ok: boolean | null = null;
  try {
    if (header.alg === "HS256") {
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (!secret) return null;
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      ok = await crypto.subtle.verify("HMAC", key, sig, data);
    } else if (header.alg === "ES256" || header.alg === "RS256") {
      let keys = await getJwks(supabaseUrl);
      let jwk = keys.find((k) => k.kid === header.kid);
      if (!jwk) {
        keys = await getJwks(supabaseUrl, true); // keys may have rotated
        jwk = keys.find((k) => k.kid === header.kid);
      }
      if (!jwk) return null;
      if (header.alg === "ES256") {
        const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, data);
      } else {
        const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
        ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
      }
    } else {
      return null;
    }
  } catch {
    return null;
  }
  if (!ok) return null;
  return { sub: String(payload.sub), email: payload.email ?? null };
}
