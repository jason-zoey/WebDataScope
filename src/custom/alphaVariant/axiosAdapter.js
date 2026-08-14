function request(method, path, data, config = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'WQP_VARIANT_API_REQUEST', request: { method, path, data, params: config.params, timeout: config.timeout } }, (response) => {
            if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
            if (response?.ok) { resolve(response.data); return; }
            const error = new Error(response?.error || '请求失败');
            error.response = { status: response?.status, data: response?.data || { detail: response?.error } };
            reject(error);
        });
    });
}
export default { get: (path, config) => request('GET', path, undefined, config), post: (path, data, config) => request('POST', path, data, config) };
