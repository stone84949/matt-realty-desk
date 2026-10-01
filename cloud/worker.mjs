import { verifyAccess, validWriteRequest } from './auth.mjs';
import { handleApi } from './api.mjs';
function secure(response) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    return new Response(response.body, { status: response.status, headers });
}
export default {
    async fetch(request, env) {
        if (!await verifyAccess(request, env))
            return secure(Response.json({ error: 'Sign-in required.' }, { status: 401 }));
        if (!['GET', 'HEAD', 'POST', 'PATCH'].includes(request.method))
            return secure(Response.json({ error: 'Method not allowed.' }, { status: 405 }));
        if (['POST', 'PATCH'].includes(request.method) && !validWriteRequest(request))
            return secure(Response.json({ error: 'Use the CRM form on this site.' }, { status: 403 }));
        try {
            const path = new URL(request.url).pathname;
            if (['/api/voice/transcribe', '/api/tts', '/api/command/interpret', '/api/command/execute'].includes(path))
                return secure(Response.json({ error: 'Assistant and voice are not connected in the hosted demo.' }, { status: 503 }));
            if (path.startsWith('/api/'))
                return secure(await handleApi(request, env));
            if (!['GET', 'HEAD'].includes(request.method))
                return secure(new Response('Not found', { status: 404 }));
            return secure(await env.ASSETS.fetch(request));
        }
        catch {
            return secure(Response.json({ error: 'The CRM could not complete this request. Please try again.' }, { status: 500 }));
        }
    },
};
