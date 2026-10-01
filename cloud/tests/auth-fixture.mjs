export async function authFixture(issuer = 'https://fixture.cloudflareaccess.com') {
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'fixture', alg: 'RS256', use: 'sig' };
    const env = { ACCESS_ISSUER: issuer, ACCESS_AUDIENCE: 'fixture-audience', ALLOWED_EMAILS: 'owner@example.test' };
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({ iss: issuer, aud: [env.ACCESS_AUDIENCE], email: 'owner@example.test', nbf: Math.floor(Date.now() / 1000) - 1, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(unsigned));
    return { env, token: `${unsigned}.${Buffer.from(signature).toString('base64url')}`, keys: () => Response.json({ keys: [jwk] }) };
}
