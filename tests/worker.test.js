const test = require('node:test');
const assert = require('node:assert/strict');
const { default: worker, validateInput } = require('../worker/worker.mjs');

const auth = {
    authkey: 'x'.repeat(40),
    authkey_ver: '1',
    sign_type: '2',
    auth_appid: 'webview_gacha',
    region: 'os_usa',
    lang: 'en',
    game_biz: ''
};

function request(body, options) {
    const headers = new Headers({
        Origin: 'https://tuvakar.github.io',
        'Content-Type': 'application/json'
    });
    if (options && options.headers) {
        for (const [key, value] of Object.entries(options.headers)) headers.set(key, value);
    }
    return new Request('https://worker.example/api/wishes', {
        method: options && options.method || 'POST',
        headers: headers,
        body: options && options.body !== undefined ? options.body : JSON.stringify(body)
    });
}

test('worker validates the supported wish request shape', () => {
    assert.equal(validateInput({ auth, gacha_type: '301', size: 20, end_id: '0' }), null);
    assert.match(validateInput({ auth, gacha_type: '999', size: 20, end_id: '0' }), /banner/i);
    assert.match(validateInput({ auth: { ...auth, region: 'file:///etc' }, gacha_type: '301', size: 20, end_id: '0' }), /region/i);
});

test('worker rejects unapproved origins before handling wish data', async () => {
    const req = new Request('https://worker.example/api/wishes', {
        method: 'POST',
        headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth, gacha_type: '301', size: 20, end_id: '0' })
    });
    const response = await worker.fetch(req, { ALLOWED_ORIGINS: 'https://tuvakar.github.io' });
    assert.equal(response.status, 403);
});

test('worker ignores caller-supplied URLs and only requests the fixed official API', async () => {
    const originalFetch = global.fetch;
    let requestedUrl;
    global.fetch = async url => {
        requestedUrl = new URL(url);
        return new Response(JSON.stringify({ retcode: 0, data: { list: [] } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };
    try {
        const response = await worker.fetch(
            request({ auth, url: 'https://attacker.example', gacha_type: '301', size: 20, end_id: '0' }),
            { ALLOWED_ORIGINS: 'https://tuvakar.github.io' }
        );
        assert.equal(response.status, 200);
        assert.equal(requestedUrl.hostname, 'public-operation-hk4e-sg.hoyoverse.com');
        assert.equal(requestedUrl.searchParams.get('authkey'), auth.authkey);
        assert.equal(requestedUrl.searchParams.get('gacha_type'), '301');
        assert.equal(requestedUrl.searchParams.get('game_biz'), 'hk4e_global');
    } finally {
        global.fetch = originalFetch;
    }
});

test('worker rejects malformed or oversized auth tokens', async () => {
    assert.ok(validateInput({ auth: { ...auth, authkey: 'short' }, gacha_type: '301', size: 20, end_id: '0' }));
    assert.ok(validateInput({ auth: { ...auth, authkey: 'x'.repeat(8193) }, gacha_type: '301', size: 20, end_id: '0' }));
});

test('worker bounds request bodies before parsing', async () => {
    const req = new Request('https://worker.example/api/wishes', {
        method: 'POST',
        headers: {
            Origin: 'https://tuvakar.github.io',
            'Content-Type': 'application/json',
            'Content-Length': '16385'
        },
        body: JSON.stringify({ auth, gacha_type: '301', size: 20, end_id: '0' })
    });
    const response = await worker.fetch(req, { ALLOWED_ORIGINS: 'https://tuvakar.github.io' });
    assert.equal(response.status, 413);
});
