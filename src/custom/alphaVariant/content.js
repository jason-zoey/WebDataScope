(() => {
    if (window.__WQP_ALPHA_VARIANT__) return;
    window.__WQP_ALPHA_VARIANT__ = true;
    const BUTTON_ID = 'wqp-alpha-variant-inline-button';
    let lastAlphaId = '';

    function alphaId() {
        const match = location.pathname.match(/^\/alphas?\/([^/?#]+)/i);
        const value = decodeURIComponent(match?.[1] || '');
        return value && !['unsubmitted', 'submitted', 'distribution'].includes(value.toLowerCase()) ? value : '';
    }

    function cardAlphaId() {
        const card = document.getElementById('wqp-prod-memo-card');
        return String(card?.dataset?.alphaId || '').trim();
    }

    function closeModal() {
        document.getElementById('wqp-alpha-variant-modal')?.remove();
    }

    function openModal(id) {
        closeModal();
        const modal = document.createElement('div');
        modal.id = 'wqp-alpha-variant-modal';
        modal.innerHTML = `<div class="wqp-alpha-variant__backdrop"></div><section class="wqp-alpha-variant__dialog" role="dialog" aria-modal="true"><header><strong>Alpha 变体生成 · ${id}</strong><button type="button" aria-label="关闭">×</button></header><iframe title="Alpha 变体生成" src="${chrome.runtime.getURL(`src/custom/alphaVariant/dist/page.html?alphaId=${encodeURIComponent(id)}`)}"></iframe></section>`;
        modal.querySelector('header button').addEventListener('click', closeModal);
        modal.querySelector('.wqp-alpha-variant__backdrop').addEventListener('click', closeModal);
        document.body.appendChild(modal);
    }

    function ensureButton() {
        const id = cardAlphaId() || alphaId();
        const card = document.getElementById('wqp-prod-memo-card');
        const actions = card?.querySelector('.wqp-prod-header-actions');
        if (!id || !card || !actions || (cardAlphaId() && cardAlphaId() !== id)) {
            document.getElementById(BUTTON_ID)?.remove();
            return;
        }
        lastAlphaId = id;
        const existing = document.getElementById(BUTTON_ID);
        if (existing && existing.dataset.alphaId === id && existing.parentElement === actions) return;
        existing?.remove();
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.dataset.alphaId = id;
        button.type = 'button';
        button.className = 'wqp-alpha-variant-inline-button';
        button.textContent = '生成变体';
        button.addEventListener('click', () => openModal(cardAlphaId() || alphaId() || lastAlphaId));
        actions.appendChild(button);
    }

    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
    window.addEventListener('message', (event) => {
        if (event.source !== window || event.data?.type !== 'WQP_PRODMEMO_ALPHA_VIEW') return;
        lastAlphaId = String(event.data.alphaId || '').trim();
        setTimeout(ensureButton, 0);
    });
    new MutationObserver(ensureButton).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(ensureButton, 800);
    ensureButton();
})();
