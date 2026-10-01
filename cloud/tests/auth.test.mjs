import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccess, validWriteRequest } from '../auth.mjs';
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const publicKey = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'synthetic-key', alg: 'RS256', use: 'sig' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const env = { ACCESS_ISSUER: 'https://demo.cloudflareaccess.com', ACCESS_AUDIENCE: 'demo-audience', ALLOWED_EMAILS: 'owner@example.test' };
const claims = { iss: env.ACCESS_ISSUER, aud: [env.ACCESS_AUDIENCE], nbf: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 300, email: 'owner@example.test' };
const keys = async () => Response.json({ keys: [publicKey] });
async function token(overrides = {}, header = { alg: 'RS256', kid: 'synthetic-key' }) {
    const unsigned = `${encode(header)}.${encode({ ...claims, ...overrides })}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(unsigned));
    return `${unsigned}.${Buffer.from(signature).toString('base64url')}`;
}
const request = jwt => new Request('https://crm.example.test/api/contacts', { headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} });
test('valid signed allowlisted identity is accepted', async () => assert.equal((await verifyAccess(request(await token()), env, keys))?.email, claims.email));
test('missing token and forged email header are rejected', async () => assert.equal(await verifyAccess(new Request('https://crm.example.test/', { headers: { 'Cf-Access-Authenticated-User-Email': claims.email } }), env, keys), null));
for (const [label, override] of [['wrong audience', { aud: ['other'] }], ['wrong issuer', { iss: 'https://other.cloudflareaccess.com' }], ['expired', { exp: 1 }], ['future', { nbf: Math.floor(Date.now() / 1000) + 3600 }], ['wrong email', { email: 'stranger@example.test' }], ['missing expiry', { exp: undefined }], ['missing not-before', { nbf: undefined }]]) {
    test(label, async () => assert.equal(await verifyAccess(request(await token(override)), env, keys), null));
}
test('unsigned and tampered tokens are rejected', async () => {
    assert.equal(await verifyAccess(request(await token({}, { alg: 'none', kid: 'synthetic-key' })), env, keys), null);
    const jwt = await token();
    const pieces = jwt.split('.');
    pieces[1] = encode({ ...claims, exp: claims.exp + 60 });
    assert.equal(await verifyAccess(request(pieces.join('.')), env, keys), null);
});
test('missing configuration and unreachable keys fail closed', async () => {
    assert.equal(await verifyAccess(request(await token()), {}, keys), null);
    const issuer = 'https://unavailable.cloudflareaccess.com';
    assert.equal(await verifyAccess(request(await token({ iss: issuer })), { ...env, ACCESS_ISSUER: issuer }, async () => { throw Error('offline'); }), null);
});
test('writes require same origin JSON and reject cross-site metadata', () => {
    const write = headers => new Request('https://crm.example.test/api/contacts', { method: 'POST', headers });
    assert.equal(validWriteRequest(write({ Origin: 'https://crm.example.test', 'Content-Type': 'application/json' })), true);
    assert.equal(validWriteRequest(write({ Origin: 'https://evil.example', 'Content-Type': 'application/json' })), false);
    assert.equal(validWriteRequest(write({ 'Content-Type': 'application/json' })), false);
    assert.equal(validWriteRequest(write({ Origin: 'https://crm.example.test', 'Content-Type': 'text/plain' })), false);
    assert.equal(validWriteRequest(write({ Origin: 'https://crm.example.test', 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' })), false);
});
test('unknown signing key requests have a refresh cooldown', async () => {
    const issuer = 'https://cooldown.cloudflareaccess.com';
    let calls = 0;
    const fetchKeys = async () => { calls++; return Response.json({ keys: [publicKey] }); };
    const jwt = await token({ iss: issuer }, { alg: 'RS256', kid: 'unknown' });
    for (let i = 0; i < 5; i++)
        assert.equal(await verifyAccess(request(jwt), { ...env, ACCESS_ISSUER: issuer }, fetchKeys), null);
    assert.equal(calls, 1);
});
test('concurrent valid sign-ins share the in-flight signing-key fetch', async () => {
    const issuer = 'https://concurrent.cloudflareaccess.com';
    let calls = 0;
    const fetchKeys = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ keys: [publicKey] }); };
    const jwt = await token({ iss: issuer });
    const results = await Promise.all([verifyAccess(request(jwt), { ...env, ACCESS_ISSUER: issuer }, fetchKeys), verifyAccess(request(jwt), { ...env, ACCESS_ISSUER: issuer }, fetchKeys)]);
    assert.equal(calls, 1);
    assert.ok(results.every(result => result?.email === claims.email));
});
