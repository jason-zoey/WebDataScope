const CONFIG_KEY = 'WQP_AlphaVariantConfig';
const DEFAULT_CONFIG = { baseUrl: 'http://localhost:8888' };
const ALLOWED_PATHS = [
    /^\/api\/variant\/preview\/[^/?#]+$/,
    /^\/api\/variant\/datafield-history$/,
    /^\/api\/variant\/save$/,
    /^\/api\/variant\/tasks\/(?:enqueue|immediate|status)$/,
    /^\/api\/variant\/backtest\/(?:stats|groups|batches|tasks)$/,
    /^\/api\/variant\/backtest\/groups\/run$/,
    /^\/api\/variant\/backtest\/batches\/[^/?#]+\/retry$/,
    /^\/api\/variant\/backtest\/tasks\/[^/?#]+\/retry$/,
    /^\/api\/alpha\/[^/?#]+$/,
];

function normalizeBaseUrl(value) {
    const url = new URL(String(value || DEFAULT_CONFIG.baseUrl).trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API 地址仅支持 HTTP 或 HTTPS');
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
}

async function getConfig() {
    const stored = await chrome.storage.local.get(CONFIG_KEY);
    return { baseUrl: normalizeBaseUrl(stored[CONFIG_KEY]?.baseUrl) };
}

async function saveConfig(config = {}) {
    const saved = { baseUrl: normalizeBaseUrl(config.baseUrl) };
    const origin = `${new URL(saved.baseUrl).origin}/*`;
    if (!await chrome.permissions.contains({ origins: [origin] })) {
        const granted = await chrome.permissions.request({ origins: [origin] });
        if (!granted) throw new Error(`未授予访问 ${origin} 的权限`);
    }
    await chrome.storage.local.set({ [CONFIG_KEY]: saved });
    return saved;
}

function allowedPath(path) {
    const pathname = new URL(path, 'https://local.invalid').pathname;
    return ALLOWED_PATHS.some((pattern) => pattern.test(pathname));
}

async function apiRequest(request = {}) {
    const method = String(request.method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) throw new Error(`不支持的请求方法：${method}`);
    if (!allowedPath(request.path)) throw new Error(`不允许访问接口：${request.path}`);
    const config = await getConfig();
    const url = new URL(request.path, `${config.baseUrl}/`);
    Object.entries(request.params || {}).forEach(([key, value]) => {
        (Array.isArray(value) ? value : [value]).forEach((item) => {
            if (item !== undefined && item !== null) url.searchParams.append(key, String(item));
        });
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(request.timeout) || 30000);
    try {
        const response = await fetch(url, {
            method,
            headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
            body: method === 'POST' ? JSON.stringify(request.data ?? {}) : undefined,
            signal: controller.signal,
        });
        const text = await response.text();
        let data;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = { message: text || response.statusText }; }
        if (!response.ok) {
            const error = new Error(data?.message || `HTTP ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return { status: response.status, data };
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('请求超时，请检查 Alpha 后端服务');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function respond(sendResponse, task) {
    task.then((data) => sendResponse({ ok: true, data }))
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error), status: error.status, data: error.data }));
    return true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'WQP_VARIANT_CONFIG_GET') return respond(sendResponse, getConfig());
    if (message?.type === 'WQP_VARIANT_CONFIG_SAVE') return respond(sendResponse, saveConfig(message.config));
    if (message?.type === 'WQP_VARIANT_CONNECTION_TEST') {
        return respond(sendResponse, apiRequest({ method: 'GET', path: '/api/alpha/__wqp_connection_test__', timeout: 8000 }).catch((error) => {
            if (error.status && error.status < 500) return { reachable: true };
            throw error;
        }));
    }
    if (message?.type === 'WQP_VARIANT_API_REQUEST') return respond(sendResponse, apiRequest(message.request));
    return false;
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'WQP_MYSQL_SYNC_PORT') return;
    port.onMessage.addListener(async (message) => {
        if (message?.type !== 'START') return;
        try {
            const config = await getConfig();
            port.postMessage({ type: 'progress', message: '正在请求 Alpha 同步接口…' });
            const response = await fetch(new URL('/api/alpha/sync', `${config.baseUrl}/`), {
                method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(message.payload || {}),
            });
            const text = await response.text();
            let envelope;
            try { envelope = text ? JSON.parse(text) : null; } catch (_) { envelope = { success: false, message: text || response.statusText }; }
            if (!response.ok || !envelope?.success) {
                throw new Error(envelope?.message || `HTTP ${response.status}`);
            }
            port.postMessage({ type: 'done', ok: true, data: envelope.data });
        } catch (error) { try { port.postMessage({ type: 'done', ok: false, error: error.message || String(error) }); } catch (_) {} }
    });
});
