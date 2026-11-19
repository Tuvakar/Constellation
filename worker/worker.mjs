const OFFICIAL_ENDPOINTS = {
    global: ['https://public-operation-hk4e-sg.hoyoverse.com/gacha_info/api/getGachaLog'],
    china: [
        'https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog'
    ]
};

const ALLOWED_BANNERS = new Set(['200', '301', '302', '500']);
const AUTH_FIELDS = [
    'authkey',
    'authkey_ver',
    'sign_type',
    'auth_appid',
    'init_type',
    'timestamp',
    'lang',
    'device_type',
    'game_version',
    'region',
    'game_biz'
];

function jsonResponse(body, status, headers) {
    const responseHeaders = new Headers(headers || {});
    responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(JSON.stringify(body), { status: status, headers: responseHeaders });
}

function allowedOrigins(env) {
    return String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);
}

function corsHeaders(request, env) {
    const origin = request.headers.get('Origin');
    if (!origin || !allowedOrigins(env).includes(origin)) return null;
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin'
    };
}

function validateInput(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || !body.auth || typeof body.auth !== 'object') {
        return 'Invalid request.';
    }

    const auth = body.auth;
    if (typeof auth.authkey !== 'string' || auth.authkey.length < 20 || auth.authkey.length > 8192) {
        return 'The wish URL has an invalid or expired authentication key.';
    }
    if (auth.authkey_ver !== '1' || auth.sign_type !== '2' || auth.auth_appid !== 'webview_gacha') {
        return 'This does not look like a supported Genshin wish URL.';
    }
    if (typeof auth.region !== 'string' || !/^(os|cn)_[a-z0-9_]+$/.test(auth.region)) {
        return 'The wish URL has an unsupported region.';
    }
    if (!ALLOWED_BANNERS.has(String(body.gacha_type))) {
        return 'Unsupported wish banner.';
    }
    if (body.size !== 20) return 'Invalid page size.';
    if (typeof body.end_id !== 'string' || !/^\d{1,24}$/.test(body.end_id)) {
        return 'Invalid wish page cursor.';
    }
    for (const field of AUTH_FIELDS) {
        if (typeof auth[field] === 'string' && auth[field].length > 4096) {
            return 'The wish URL contains an invalid parameter.';
        }
    }
    return null;
}

async function readBoundedBody(request, maxBytes) {
    if (!request.body) return '';
    const reader = request.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const result = await reader.read();
        if (result.done) break;
        totalBytes += result.value.byteLength;
        if (totalBytes > maxBytes) {
            await reader.cancel();
            throw new RangeError('Request is too large.');
        }
        chunks.push(result.value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}

async function fetchWishes(body) {
    const region = body.auth.region;
    const endpoints = region.startsWith('cn_') ? OFFICIAL_ENDPOINTS.china : OFFICIAL_ENDPOINTS.global;
    const params = new URLSearchParams();
    for (const field of AUTH_FIELDS) {
        if (field === 'game_biz') {
            const gameBiz = body.auth.game_biz || (region.startsWith('cn_') ? 'hk4e_cn' : 'hk4e_global');
            params.set(field, gameBiz);
        } else if (typeof body.auth[field] === 'string') {
            params.set(field, body.auth[field]);
        }
    }
    params.set('gacha_type', String(body.gacha_type));
    params.set('size', '20');
    params.set('end_id', body.end_id);

    let lastFailure = 'The official wish service is unavailable.';
    for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(`${endpoint}?${params.toString()}`, {
                headers: { Accept: 'application/json' },
                signal: controller.signal
            });
            if (!response.ok) {
                lastFailure = `The official wish service returned HTTP ${response.status}.`;
                continue;
            }
            const payload = await response.json();
            if (!payload || typeof payload.retcode !== 'number') {
                lastFailure = 'The official wish service returned an unexpected response.';
                continue;
            }
            return payload;
        } catch (error) {
            lastFailure = error.name === 'AbortError'
                ? 'The official wish service timed out.'
                : 'The official wish service could not be reached.';
        } finally {
            clearTimeout(timeout);
        }
    }
    throw new Error(lastFailure);
}

export default {
    async fetch(request, env) {
        const headers = corsHeaders(request, env);
        if (!headers) return jsonResponse({ error: 'Origin not allowed.' }, 403);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers });
        if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/wishes') {
            return jsonResponse({ error: 'Not found.' }, 404, headers);
        }
        if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
            return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, headers);
        }
        const contentLength = Number(request.headers.get('Content-Length') || 0);
        if (contentLength > 16384) return jsonResponse({ error: 'Request is too large.' }, 413, headers);

        const clientIp = request.headers.get('CF-Connecting-IP');
        if (env.RATE_LIMITER && clientIp) {
            const limit = await env.RATE_LIMITER.limit({ key: clientIp });
            if (!limit.success) return jsonResponse({ error: 'Too many requests. Please wait a minute and try again.' }, 429, headers);
        }

        let body;
        try {
            const raw = await readBoundedBody(request, 16384);
            body = JSON.parse(raw);
        } catch (error) {
            if (error instanceof RangeError) return jsonResponse({ error: error.message }, 413, headers);
            return jsonResponse({ error: 'Invalid JSON request.' }, 400, headers);
        }

        const validationError = validateInput(body);
        if (validationError) return jsonResponse({ error: validationError }, 400, headers);

        try {
            const payload = await fetchWishes(body);
            return jsonResponse(payload, 200, headers);
        } catch (error) {
            return jsonResponse({ error: error.message }, 502, headers);
        }
    }
};

export { validateInput, fetchWishes, readBoundedBody };
