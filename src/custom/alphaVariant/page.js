import { createApp, h, ref } from 'vue';
import ElementPlus, { ElMessage } from 'element-plus';
import 'D:/codexCode2/alpha-system/alpha-web/node_modules/element-plus/dist/index.css';
import VariantManager from './VariantManager.vue';
import './page.css';

const initialAlphaId = new URLSearchParams(location.search).get('alphaId') || '';

const Root = {
    setup() {
        const showConfig = ref(false);
        const baseUrl = ref('http://localhost:8888');
        const saving = ref(false);
        chrome.runtime.sendMessage({ type: 'WQP_VARIANT_CONFIG_GET' }, (response) => {
            if (response?.ok) baseUrl.value = response.data.baseUrl;
        });
        const save = () => {
            saving.value = true;
            chrome.runtime.sendMessage({ type: 'WQP_VARIANT_CONFIG_SAVE', config: { baseUrl: baseUrl.value } }, (response) => {
                saving.value = false;
                if (response?.ok) { baseUrl.value = response.data.baseUrl; showConfig.value = false; ElMessage.success('API 地址已保存'); }
                else ElMessage.error(response?.error || '保存失败');
            });
        };
        return () => h('div', { class: 'variant-app' }, [
            h('div', { class: 'variant-toolbar' }, [h('span', `当前 Alpha：${initialAlphaId}`), h('button', { onClick: () => { showConfig.value = !showConfig.value; } }, '后端设置')]),
            showConfig.value ? h('div', { class: 'variant-config' }, [h('input', { value: baseUrl.value, placeholder: 'http://localhost:8888', onInput: (e) => { baseUrl.value = e.target.value; } }), h('button', { disabled: saving.value, onClick: save }, saving.value ? '保存中…' : '保存')]) : null,
            h(VariantManager, { initialAlphaId }),
        ]);
    },
};

createApp(Root).use(ElementPlus).mount('#app');
