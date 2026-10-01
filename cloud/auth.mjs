const keyCache = new Map();
const keyRefreshes = new Map();
const encoder = new TextEncoder();
async function keysFor(issuer, kid, fetchKeys) {
    const cached = keyCache.get(issuer);
    if (cached?.expires > Date.now() && cached.keys.some(key => key.kid === kid))
        return cached;
    if (keyRefreshes.has(issuer))
        return keyRefreshes.get(issuer);
    if (cached?.retryAfter > Date.now())
        return null;
    const refresh = (async () => {
        try {
            const response = await fetchKeys(`${issuer}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
            if (!response.ok)
                throw new Error('Signing keys unavailable');
            const jwks = await response.json();
            if (!Array.isArray(jwks.keys))
                throw new Error('Invalid signing keys');
            const result = { keys: jwks.keys, expires: Date.now() + 600000, retryAfter: Date.now() + 30000 };
            keyCache.set(issuer, result);
            return result;
        }
        catch {
            keyCache.set(issuer, { keys: [], expires: 0, retryAfter: Date.now() + 30000 });
            return null;
        }
    })();
    keyRefreshes.set(issuer, refresh);
    try {
        return await refresh;
    }
    finally {
        keyRefreshes.delete(issuer);
    }
}
function decode(part) {
    if (!/^[A-Za-z0-9_-]+$/.test(part))
        throw new Error('Invalid encoding');
    return Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
export async function verifyAccess(request, env, fetchKeys = fetch) {
    const issuer = String(env.ACCESS_ISSUER || '').replace(/\/$/, '');
    const audience = env.ACCESS_AUDIENCE;
    const emails = String(env.ALLOWED_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !audience || !emails.length)
        return null;
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token || token.length > 16000)
        return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
        const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
        const now = Date.now() / 1000;
        if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 128)
            return null;
        if (claims.iss !== issuer || !Number.isFinite(claims.exp) || claims.exp <= now)
            return null;
        if (!Number.isFinite(claims.nbf) || claims.nbf > now)
            return null;
        const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        if (!audiences.includes(audience) || typeof claims.email !== 'string' || !emails.includes(claims.email.toLowerCase()))
            return null;
        const cached = await keysFor(issuer, header.kid, fetchKeys);
        if (!cached)
            return null;
        const jwk = cached.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
        if (!jwk)
            return null;
        const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
        if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`)))
            return null;
        return { email: claims.email.toLowerCase() };
    }
    catch {
        // Invalid tokens and unavailable signing keys never grant access.
        return null;
    }
}
export function validWriteRequest(request) {
    return request.headers.get('Origin') === new URL(request.url).origin
        && request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/json'
        && !['cross-site', 'none'].includes(request.headers.get('Sec-Fetch-Site'));
}
