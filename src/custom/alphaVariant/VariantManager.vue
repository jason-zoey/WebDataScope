<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const emptyCandidates = () => ({
  neutralization: [],
  universe: [],
  delay: [],
  decay: [],
  truncation: [],
  second_order: {
    operators: [],
    group_fields: []
  },
  third_order: {
    conditions: [],
    exit_conditions: []
  },
  expression: {}
})

const props = defineProps({ initialAlphaId: { type: String, default: '' } })
const alphaId = ref('')
const loading = ref(false)
const generating = ref(false)
const saving = ref(false)
const taskActionLoading = ref('')
const message = ref('')
const messageType = ref('success')
const candidates = ref(emptyCandidates())
const variants = ref([])
const chainStack = ref([])
const sourceExpression = ref('')
const sourceDetail = ref(null)
const sourceDetailLoading = ref(false)
const datafieldHistory = ref([])
const datafieldHistoryLoading = ref(false)
const historySortBy = ref('dateCreated')
const historySortOrder = ref('desc')
const historySortOptions = [
  { value: 'dateCreated', label: '创建时间' },
  { value: 'sharpe', label: 'Sharpe' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'turnover', label: 'Turnover' },
  { value: 'margin', label: 'Margin' },
  { value: 'returns', label: 'Returns' },
  { value: 'drawdown', label: 'Drawdown' }
]
const candidatePanelNames = ref(['range'])
const forceDuplicates = reactive({})
const baseNeut = ref('')
const baseUniverse = ref('')
const baseDelay = ref(null)
const baseDecay = ref(null)
const baseTrunc = ref(null)
const customInputs = reactive({ neutralization: '', decay: '', truncation: '', expression: {} })
const selected = reactive({
  neutralization: {},
  universe: {},
  delay: {},
  decay: {},
  truncation: {},
  second_order: {
    operators: {},
    group_fields: {}
  },
  third_order: {
    conditions: {},
    exit_conditions: {}
  },
  expression: {}
})

const currentBaseId = computed(() => chainStack.value.length > 1
  ? chainStack.value[chainStack.value.length - 1].id
  : null)
const currentDepth = computed(() => Math.max(0, chainStack.value.length - 1))

let taskStatusTimer = null
const ACTIVE_TASK_STATUSES = new Set(['QUEUED', 'CLAIMED', 'SUBMITTED', 'PROCESSING'])

function hasAnySelection(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.values(value).some(item => hasAnySelection(item))
  return Boolean(value)
}

function countSelectedTree(value) {
  if (Array.isArray(value)) return value.filter(Boolean).length
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((count, item) => count + countSelectedTree(item), 0)
  }
  return value ? 1 : 0
}

const hasCandidates = computed(() => {
  const value = candidates.value
  return hasAnySelection(value.neutralization)
    || hasAnySelection(value.universe)
    || hasAnySelection(value.delay)
    || hasAnySelection(value.decay)
    || hasAnySelection(value.truncation)
    || hasAnySelection(value.second_order)
    || hasAnySelection(value.third_order)
    || hasAnySelection(value.expression)
})

const selectedCount = computed(() => {
  return countSelectedTree(selected.neutralization)
    + countSelectedTree(selected.universe)
    + countSelectedTree(selected.delay)
    + countSelectedTree(selected.decay)
    + countSelectedTree(selected.truncation)
    + countSelectedTree(selected.second_order)
    + countSelectedTree(selected.third_order)
    + countSelectedTree(selected.expression)
})

const relationIdOf = row => row.relation_id ?? row.relationId ?? null
const taskStatusOf = row => row.task_status ?? row.taskStatus ?? null
const resultAlphaIdOf = row => row.result_alpha_id ?? row.resultAlphaId ?? null
const newVariantCount = computed(() => variants.value.filter(row => !relationIdOf(row)).length)
const savedVariantCount = computed(() => variants.value.filter(row => relationIdOf(row)).length)

watch(() => props.initialAlphaId, value => {
  if (value) {
    alphaId.value = value
    void preview()
  }
}, { immediate: true })

function clearObject(map) {
  for (const key of Object.keys(map)) delete map[key]
}

function clearSelected() {
  for (const key of ['neutralization', 'universe', 'delay', 'decay', 'truncation', 'expression']) {
    clearObject(selected[key])
  }
  for (const key of ['operators', 'group_fields']) {
    clearObject(selected.second_order[key])
  }
  for (const key of ['conditions', 'exit_conditions']) {
    clearObject(selected.third_order[key])
  }
}

function setSelected(type, key, checked) {
  selected[type][String(key)] = Boolean(checked)
}

function setNestedSelected(group, section, key, checked) {
  selected[group][section][String(key)] = Boolean(checked)
}

function setNestedGroupSelected(group, section, subgroup, key, checked) {
  if (!selected[group][section][subgroup]) selected[group][section][subgroup] = {}
  selected[group][section][subgroup][String(key)] = Boolean(checked)
}

function setExpressionSelected(label, value, checked) {
  if (!selected.expression[label]) selected.expression[label] = {}
  selected.expression[label][String(value)] = Boolean(checked)
}

function numericNeighbors(base, values) {
  if (base === null || base === undefined || Number.isNaN(Number(base))) return []
  const current = Number(base)
  const numbers = values.map(Number).filter(value => !Number.isNaN(value))
  const lower = numbers.filter(value => value < current)
  const upper = numbers.filter(value => value > current)
  return [lower.length ? Math.max(...lower) : null, upper.length ? Math.min(...upper) : null]
    .filter(value => value !== null)
}

function initializeSelected() {
  clearSelected()
  candidates.value.neutralization.forEach(value => {
    setSelected('neutralization', value, value !== 'NONE' && value !== baseNeut.value)
  })
  candidates.value.universe.forEach(value => {
    setSelected('universe', value, value !== baseUniverse.value)
  })
  candidates.value.delay.forEach(value => {
    setSelected('delay', value, true)
  })
  numericNeighbors(baseDecay.value, candidates.value.decay)
    .forEach(value => setSelected('decay', value, true))
  numericNeighbors(baseTrunc.value, candidates.value.truncation)
    .forEach(value => setSelected('truncation', value, true))

  for (const [label, meta] of Object.entries(candidates.value.expression)) {
    selected.expression[label] = {}
    if (meta.type === 'time') {
      numericNeighbors(meta.original, meta.options || [])
        .forEach(value => setExpressionSelected(label, value, true))
    }
  }
}
function setMessage(type, text) {
  messageType.value = type
  message.value = text
  ElMessage[type](text)
}

function normalizeHistoryRecord(record) {
  const metrics = record.isJson ?? record.is_json ?? {}
  const value = (camel, snake) => record[camel] ?? record[snake] ?? metrics[camel] ?? metrics[snake] ?? null
  return {
    ...record,
    alphaId: record.alphaId ?? record.alpha_id ?? '',
    expression: record.expression ?? '',
    region: record.region ?? '',
    universe: record.universe ?? '',
    sharpe: value('sharpe', 'sharpe'),
    fitness: value('fitness', 'fitness'),
    turnover: value('turnover', 'turnover'),
    margin: value('margin', 'margin'),
    returns: value('returns', 'returns'),
    drawdown: value('drawdown', 'drawdown'),
    historyDate: record.dateSubmitted ?? record.date_submitted
      ?? record.dateCreated ?? record.date_created
      ?? record.dateModified ?? record.date_modified
  }
}

function normalizeAlphaRecord(record) {
  return record ? normalizeHistoryRecord(record) : null
}

function formatHistoryDate(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ').replace(/\.\d+$/, '')
}

async function preview() {
  clearTaskStatusTimer()
  const id = alphaId.value.trim()
  if (!id) {
    setMessage('warning', '请输入源 Alpha ID')
    return
  }
  if (!chainStack.value.length || chainStack.value[0].id !== id) {
    chainStack.value = [{ id, label: '?Alpha' }]
  }
  loading.value = true
  message.value = ''
  variants.value = []
  sourceDetail.value = null
  sourceDetailLoading.value = true
  void loadSourceDetail(id)
  try {
    const response = await axios.post(`/api/variant/preview/${encodeURIComponent(id)}`, {
      base_variant_id: currentBaseId.value,
      parent_alpha_id: currentBaseId.value || id,
      root_alpha_id: id,
      depth: currentDepth.value,
      generate: false
    })
    const data = response.data.data
    if (!response.data.success || !data) {
      throw new Error(response.data.detail || '获取候选参数失败')
    }
    candidates.value = { ...emptyCandidates(), ...(data.candidates || {}) }
    sourceExpression.value = data.source_expression || ''
    // History is independent of candidate loading; do not keep the main button spinning
    // while the secondary table request is in flight.
    void loadDatafieldHistory(sourceExpression.value)
    baseNeut.value = data.base_neut || ''
    baseUniverse.value = data.source_universe || ''
    baseDelay.value = data.base_delay
    baseDecay.value = data.base_decay
    baseTrunc.value = data.base_trunc
    initializeSelected()
    candidatePanelNames.value = ['range']
    setMessage('success', `已获取 ${selectedCount.value} 个默认候选`)
  } catch (error) {
    setMessage('error', error.response?.data?.detail || error.message || '获取候选参数失败')
  } finally {
    loading.value = false
  }
}

async function loadSourceDetail(id) {
  try {
    const response = await axios.get('/api/alpha/db/detail', { params: { alpha_id: id }, timeout: 15000 })
    if (response.data.success) sourceDetail.value = normalizeAlphaRecord(response.data.data)
  } catch {
    sourceDetail.value = null
  } finally {
    sourceDetailLoading.value = false
  }
}

async function loadDatafieldHistory(expression) {
  if (!expression) { datafieldHistory.value = []; return }
  datafieldHistory.value = []
  datafieldHistoryLoading.value = true
  try {
    const response = await axios.post('/api/variant/datafield-history', {
      expression,
      page: 1,
      size: 20,
      sort_by: historySortBy.value,
      sort_order: historySortOrder.value
    }, { timeout: 15000 })
    datafieldHistory.value = (response.data.data?.records || []).map(normalizeHistoryRecord)
  } catch (error) {
    setMessage('error', error.response?.data?.message || '字段历史查询失败')
  } finally {
    datafieldHistoryLoading.value = false
  }
}

function reloadHistory() {
  if (sourceExpression.value) void loadDatafieldHistory(sourceExpression.value)
}

function buildCustom() {
  const expression = {}
  for (const [label, meta] of Object.entries(candidates.value.expression)) {
    const values = (meta.options || []).filter(value => selected.expression[label]?.[String(value)])
    if (values.length) expression[label] = values
  }
  const thirdOrderExpressions = []
  const selectedThirdConditions = candidates.value.third_order.conditions
    .filter(value => selected.third_order.conditions[String(value)])
  const selectedThirdExitConditions = candidates.value.third_order.exit_conditions
    .filter(value => selected.third_order.exit_conditions[String(value)])
  for (const condition of selectedThirdConditions) {
    for (const exitCondition of selectedThirdExitConditions) {
      thirdOrderExpressions.push(`trade_when(${condition}, ${sourceExpression.value}, ${exitCondition})`)
    }
  }
  return {
    neutralization: candidates.value.neutralization
      .filter(value => selected.neutralization[value]),
    universe: candidates.value.universe
      .filter(value => selected.universe[value]),
    delay: candidates.value.delay
      .filter(value => selected.delay[String(value)]),
    decay: candidates.value.decay.filter(value => selected.decay[String(value)]),
    truncation: candidates.value.truncation.filter(value => selected.truncation[String(value)]),
    second_order: {
      operators: candidates.value.second_order.operators
        .filter(value => selected.second_order.operators[String(value)]),
      group_fields: candidates.value.second_order.group_fields
        .filter(value => selected.second_order.group_fields[String(value)])
    },
    third_order: {
      conditions: candidates.value.third_order.conditions
        .filter(value => selected.third_order.conditions[String(value)]),
      exit_conditions: candidates.value.third_order.exit_conditions
        .filter(value => selected.third_order.exit_conditions[String(value)]),
      expressions: thirdOrderExpressions
    },
    expression
  }
}
async function generate() {
  clearTaskStatusTimer()
  if (!hasCandidates.value || !selectedCount.value) {
    setMessage('warning', '请至少选择一个候选')
    return
  }
  generating.value = true
  try {
    const response = await axios.post(`/api/variant/preview/${encodeURIComponent(alphaId.value.trim())}`, {
      base_variant_id: currentBaseId.value,
      parent_alpha_id: currentBaseId.value || alphaId.value.trim(),
      root_alpha_id: alphaId.value.trim(),
      depth: currentDepth.value,
      generate: true,
      custom: buildCustom()
    })
    const data = response.data.data || {}
    if (!response.data.success) throw new Error(response.data.detail || '生成变体失败')
    variants.value = data.variants || []
    message.value = ''
    if (variants.value.length) {
      setMessage('success', `生成了 ${variants.value.length} 个候选变体`)
    } else {
      setMessage('warning', data.message || '没有可生成的变体')
    }
  } catch (error) {
    setMessage('error', error.response?.data?.detail || error.message || '生成变体失败')
  } finally {
    generating.value = false
  }
}

function addCustomValue(type) {
  const raw = String(customInputs[type] || '').trim()
  if (!raw) return
  let value = raw
  if (type === 'decay') {
    value = Number(raw)
    if (!Number.isInteger(value) || value < 0 || value > 20) {
      setMessage('warning', 'Decay 必须是 0-20 的整数')
      return
    }
  } else if (type === 'truncation') {
    value = Number(raw)
    if (!Number.isFinite(value) || value < 0.01 || value > 0.2) {
      setMessage('warning', 'Truncation 必须在 0.01-0.20 范围内')
      return
    }
    value = Math.round(value * 100) / 100
  }
  const values = candidates.value[type]
  if (!values.some(item => String(item) === String(value))) values.push(value)
  selected[type][String(value)] = true
  customInputs[type] = ''
}

function addExpressionValue(label) {
  const raw = String(customInputs.expression[label] || '').trim()
  const value = Number(raw)
  if (!raw || !Number.isInteger(value) || value <= 0) {
    setMessage('warning', '表达式参数必须是正整数')
    return
  }
  const meta = candidates.value.expression[label]
  if (!meta.options.includes(value)) meta.options.push(value)
  if (!selected.expression[label]) selected.expression[label] = {}
  selected.expression[label][String(value)] = true
  customInputs.expression[label] = ''
}

function removeVariant(row) {
  variants.value = variants.value.filter(item => item.variant_alpha_id !== row.variant_alpha_id)
}

function removeExpressionVariants() {
  variants.value = variants.value.filter(row => row.strategy !== 'expression_optimization')
  setMessage('info', '已移除表达式变体')
}

async function useAsBase(row) {
  const resultAlphaId = resultAlphaIdOf(row)
  if (taskStatusOf(row) !== 'COMPLETED' || !resultAlphaId) {
    setMessage('warning', '需要先入库并回测完成')
    return
  }
  chainStack.value.push({ id: resultAlphaId, label: row.change_desc })
  await preview()
}

async function goBack() {
  if (chainStack.value.length <= 1) return
  chainStack.value.pop()
  await preview()
}

function clearTaskStatusTimer() {
  if (taskStatusTimer) {
    window.clearTimeout(taskStatusTimer)
    taskStatusTimer = null
  }
}

function taskStatusLabel(row) {
  return taskStatusOf(row) || row.relation_status || row.relationStatus || (relationIdOf(row) ? 'SAVED' : '-')
}

function taskStatusTagType(row) {
  const status = taskStatusLabel(row)
  if (status === 'COMPLETED') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'SAVED') return 'info'
  if (status === 'QUEUED') return 'warning'
  return 'primary'
}

function canUseAsBase(row) {
  return taskStatusOf(row) === 'COMPLETED' && Boolean(resultAlphaIdOf(row))
}

function applyTaskResult(result) {
  const relationId = result.relation_id ?? result.relationId
  const row = variants.value.find(item => String(relationIdOf(item)) === String(relationId))
  if (!row) return
  row.task_id = result.task_id ?? result.taskId ?? row.task_id
  row.task_status = result.task_status ?? result.taskStatus ?? result.status ?? row.task_status
  row.relation_status = result.relation_status ?? result.relationStatus ?? row.relation_status
  row.priority = result.priority ?? row.priority
  row.batch_id = result.batch_id ?? result.batchId ?? row.batch_id
  row.result_alpha_id = result.result_alpha_id ?? result.resultAlphaId ?? row.result_alpha_id
  row.error_message = result.error_message ?? result.errorMessage ?? null
}

async function refreshTaskStatuses({ silent = true } = {}) {
  const relationIds = variants.value.map(relationIdOf).filter(Boolean)
  if (!relationIds.length) {
    clearTaskStatusTimer()
    return
  }
  try {
    const response = await axios.get('/api/variant/tasks/status', {
      params: { relation_ids: relationIds },
      paramsSerializer: params => {
        const search = new URLSearchParams()
        params.relation_ids.forEach(id => search.append('relation_ids', id))
        return search.toString()
      }
    })
    if (!response.data.success) throw new Error(response.data.detail || '查询回测状态失败')
    const results = response.data.data || []
    results.forEach(applyTaskResult)
  } catch (error) {
    if (!silent) setMessage('error', error.response?.data?.detail || error.message || '查询回测状态失败')
  } finally {
    const hasActiveTask = variants.value.some(row => ACTIVE_TASK_STATUSES.has(taskStatusOf(row)))
    clearTaskStatusTimer()
    if (hasActiveTask) {
      taskStatusTimer = window.setTimeout(() => refreshTaskStatuses(), 3000)
    }
  }
}

async function confirmDuplicateCandidates() {
  for (const row of [...variants.value]) {
    if (!row.already_exists || relationIdOf(row) || forceDuplicates[row.variant_alpha_id]) continue
    const existingVariantId = row.existing_variant_id || '未知'
    const existingAlphaId = row.existing_alpha_id || '尚未回测完成'
    try {
      await ElMessageBox.confirm(
        `候选 ${row.variant_alpha_id} 与已入库变体重复。已有变体：${existingVariantId}；已有 Alpha：${existingAlphaId}。`,
        '发现重复变体',
        {
          type: 'warning',
          confirmButtonText: '确认重复入库',
          cancelButtonText: '取消并删除候选',
          distinguishCancelAndClose: true
        }
      )
      forceDuplicates[row.variant_alpha_id] = true
    } catch (action) {
      if (action === 'cancel') removeVariant(row)
      else return false
    }
  }
  return true
}

async function saveRelations() {
  if (!await confirmDuplicateCandidates()) return
  const rows = variants.value.filter(row => !relationIdOf(row)
    && (!row.already_exists || forceDuplicates[row.variant_alpha_id]))
  if (!rows.length) {
    setMessage('warning', '没有需要入库的变体')
    return
  }
  saving.value = true
  try {
    const payload = rows.map(row => ({
      source_alpha_id: row.source_alpha_id || alphaId.value.trim(),
      alpha_id: row.variant_alpha_id,
      variant_alpha_id: row.variant_alpha_id,
      expression: row.expression,
      settings: row.settings,
      parent_alpha_id: row.parent_alpha_id,
      root_alpha_id: row.root_alpha_id || alphaId.value.trim(),
      variant_type: row.variant_type || row.strategy,
      depth: row.depth,
      change_desc: row.change_desc,
      confirm_duplicate: Boolean(row.already_exists && forceDuplicates[row.variant_alpha_id])
    }))
    const response = await axios.post('/api/variant/save', { variants: payload })
    if (!response.data.success) throw new Error(response.data.detail || '变体入库失败')
    const results = response.data.data?.results || []
    results.forEach((result, index) => {
      const row = rows[index]
      if (!row || !(result.saved ?? true)) return
      row.relation_id = result.relation_id ?? result.relationId
      row.relation_status = result.status || 'SAVED'
      row.duplicate_of_relation_id = result.existing_relation_id ?? result.existingRelationId ?? null
      row.already_exists = true
    })
    const savedCount = response.data.data?.saved_count ?? results.filter(result => result.saved).length
    setMessage('success', `已确认入库 ${savedCount} 个变体；尚未创建回测任务`)
  } catch (error) {
    setMessage('error', error.response?.data?.detail || error.message || '变体入库失败')
  } finally {
    saving.value = false
  }
}

async function createBacktestTasks(immediate) {
  if (variants.value.some(row => !relationIdOf(row))) {
    setMessage('warning', '请先确认入库当前候选，再创建回测任务')
    return
  }
  const relationIds = variants.value.map(relationIdOf).filter(Boolean)
  if (!relationIds.length) {
    setMessage('warning', '没有已入库的变体')
    return
  }
  taskActionLoading.value = immediate ? 'immediate' : 'enqueue'
  try {
    const endpoint = immediate ? '/api/variant/tasks/immediate' : '/api/variant/tasks/enqueue'
    const response = await axios.post(endpoint, { relation_ids: relationIds })
    if (!response.data.success) throw new Error(response.data.detail || '创建回测任务失败')
    const results = response.data.data || []
    results.forEach(applyTaskResult)
    const upgraded = results.filter(result => result.upgraded).length
    setMessage('success', immediate
      ? `已加入立即回测 ${results.length} 条${upgraded ? `，其中升级 ${upgraded} 条` : ''}`
      : `已加入普通回测队列 ${results.length} 条`)
    await refreshTaskStatuses()
  } catch (error) {
    setMessage('error', error.response?.data?.detail || error.message || '创建回测任务失败')
  } finally {
    taskActionLoading.value = ''
  }
}

onBeforeUnmount(clearTaskStatusTimer)

const STRATEGY_LABELS = {
  neutralization: '\u4e2d\u6027\u5316',
  universe_optimization: 'Universe',
  settings_optimization: '\u8bbe\u7f6e',
  expression_optimization: '\u8868\u8fbe\u5f0f',
  second_order_optimization: '\u4e8c\u9636',
  third_order_optimization: '\u4e09\u9636'
}

function strategyLabel(strategy) {
  return STRATEGY_LABELS[strategy] || strategy || '\u53d8\u4f53'
}

function strategyTagType(strategy) {
  if (strategy === 'expression_optimization') return 'warning'
  if (strategy === 'second_order_optimization') return 'info'
  if (strategy === 'third_order_optimization') return 'success'
  if (strategy === 'settings_optimization') return 'success'
  if (strategy === 'universe_optimization') return 'info'
  return 'primary'
}

function removeHighOrderVariants() {
  const blocked = new Set(['expression_optimization', 'second_order_optimization', 'third_order_optimization'])
  variants.value = variants.value.filter(row => !blocked.has(row.strategy))
  setMessage('info', '\u5df2\u79fb\u9664\u8868\u8fbe\u5f0f\u3001\u4e8c\u9636\u3001\u4e09\u9636\u53d8\u4f53')
}
</script>

<template>
  <el-card shadow="never" class="variant-page">
    <template #header>
      <div class="page-header">
        <div>
          <strong>变体管理</strong>
          <span class="page-subtitle">可控参数范围</span>
        </div>
        <el-button type="primary" :loading="loading" @click="preview">获取候选</el-button>
      </div>
    </template>

    <el-form inline @submit.prevent="preview">
      <el-form-item label="源 Alpha ID">
        <el-input v-model="alphaId" clearable placeholder="输入 Alpha ID" class="source-input" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="loading" @click="preview">获取候选</el-button>
      </el-form-item>
    </el-form>

    <el-alert v-if="message" :title="message" :type="messageType" show-icon :closable="false" class="message" />

    <template v-if="hasCandidates">
      <div class="context-bar">
        <div class="chain">
          <span class="muted">优化链</span>
          <template v-for="(node, index) in chainStack" :key="node.id">
            <span v-if="index" class="chain-arrow">→</span>
            <el-tag size="small" :type="index === chainStack.length - 1 ? 'warning' : 'info'">
              {{ node.id }}
            </el-tag>
          </template>
          <el-button v-if="chainStack.length > 1" link type="primary" @click="goBack">返回上一层</el-button>
        </div>
        <div class="source-settings">
          <span class="muted">基准设置</span>
          <el-tag v-if="baseNeut" size="small" effect="plain">中性化 {{ baseNeut }}</el-tag>
          <el-tag v-if="baseUniverse" size="small" effect="plain">Universe {{ baseUniverse }}</el-tag>
          <el-tag v-if="baseDelay !== null" size="small" effect="plain">Delay {{ baseDelay }}</el-tag>
          <el-tag v-if="baseDecay !== null" size="small" effect="plain">Decay {{ baseDecay }}</el-tag>
          <el-tag v-if="baseTrunc !== null" size="small" effect="plain">Truncation {{ baseTrunc }}</el-tag>
        </div>
      </div>

      <div class="expression-preview">
        <span class="muted">表达式</span>
        <code>{{ sourceExpression || '无表达式数据' }}</code>
      </div>

      <section class="source-panel">
        <div class="history-header"><strong>Alpha 详情</strong><span>{{ sourceDetailLoading ? '加载中' : (sourceDetail ? '已加载' : '暂无记录') }}</span></div>
        <el-table v-loading="sourceDetailLoading" :data="sourceDetail ? [sourceDetail] : []" size="small" border>
          <el-table-column prop="alphaId" label="Alpha ID" min-width="140" show-overflow-tooltip />
          <el-table-column prop="expression" label="完整表达式" min-width="360" show-overflow-tooltip />
          <el-table-column prop="region" label="Region" width="90" />
          <el-table-column prop="universe" label="Universe" width="110" />
          <el-table-column prop="sharpe" label="Sharpe" width="90" />
          <el-table-column prop="fitness" label="Fitness" width="90" />
          <el-table-column prop="turnover" label="Turnover" width="100" />
          <el-table-column prop="margin" label="Margin" width="100" />
          <el-table-column prop="returns" label="Returns" width="100" />
          <el-table-column prop="drawdown" label="Drawdown" width="100" />
          <el-table-column label="回测/创建时间" width="170">
            <template #default="{ row }">{{ formatHistoryDate(row.historyDate) }}</template>
          </el-table-column>
        </el-table>
      </section>

      <section class="history-panel">
        <div class="history-header">
          <strong>数据字段历史结果</strong>
          <div class="history-sort">
            <span>排序</span>
            <el-select v-model="historySortBy" size="small" @change="reloadHistory">
              <el-option v-for="option in historySortOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
            <el-select v-model="historySortOrder" size="small" @change="reloadHistory">
              <el-option label="降序" value="desc" />
              <el-option label="升序" value="asc" />
            </el-select>
            <span>{{ datafieldHistory.length }} 条</span>
          </div>
        </div>
        <el-table v-loading="datafieldHistoryLoading" :data="datafieldHistory" size="small" border max-height="240">
          <el-table-column prop="alphaId" label="Alpha ID" min-width="140" show-overflow-tooltip />
          <el-table-column prop="expression" label="表达式" min-width="360" show-overflow-tooltip />
          <el-table-column prop="region" label="Region" width="90" />
          <el-table-column prop="universe" label="Universe" width="110" />
          <el-table-column prop="sharpe" label="Sharpe" width="90" />
          <el-table-column prop="fitness" label="Fitness" width="90" />
          <el-table-column prop="turnover" label="Turnover" width="100" />
          <el-table-column prop="margin" label="Margin" width="100" />
          <el-table-column prop="returns" label="Returns" width="100" />
          <el-table-column prop="drawdown" label="Drawdown" width="100" />
          <el-table-column label="回测/创建时间" width="170">
            <template #default="{ row }">{{ formatHistoryDate(row.historyDate) }}</template>
          </el-table-column>
        </el-table>
      </section>

      <div class="candidate-actions">
        <span class="muted">默认已选 <b>{{ selectedCount }}</b> 个候选</span>
        <el-button type="primary" :loading="generating" :disabled="!selectedCount" @click="generate">
          生成表达式变体</el-button>
      </div>

      <el-collapse v-model="candidatePanelNames" class="candidate-panel">
        <el-collapse-item title="参数范围" name="range">
          <div class="candidate-row">
            <span class="candidate-label">中性化</span>
            <div class="candidate-options">
              <el-checkbox v-for="value in candidates.neutralization" :key="`n-${value}`"
                :model-value="Boolean(selected.neutralization[value])"
                @update:model-value="checked => setSelected('neutralization', value, checked)"
                :label="value" border size="small" />
            </div>
            <el-input v-model="customInputs.neutralization" size="small" placeholder="自定义" class="custom-input"
              @keyup.enter="addCustomValue('neutralization')" />
            <el-button size="small" @click="addCustomValue('neutralization')">添加</el-button>
          </div>

          <div v-if="candidates.universe.length" class="candidate-row">
            <span class="candidate-label">Universe</span>
            <div class="candidate-options">
              <el-checkbox v-for="value in candidates.universe" :key="`u-${value}`"
                :model-value="Boolean(selected.universe[value])"
                @update:model-value="checked => setSelected('universe', value, checked)"
                :label="value" border size="small" />
            </div>
          </div>

          <div v-if="candidates.delay.length" class="candidate-row">
            <span class="candidate-label">Delay</span>
            <div class="candidate-options">
              <el-checkbox v-for="value in candidates.delay" :key="`delay-${value}`"
                :model-value="Boolean(selected.delay[String(value)])"
                @update:model-value="checked => setSelected('delay', value, checked)"
                :label="String(value)" border size="small" />
            </div>
          </div>

          <div v-for="type in ['decay', 'truncation']" :key="type" class="candidate-row">
            <span class="candidate-label">{{ type === 'decay' ? 'Decay' : 'Truncation' }}</span>
            <div class="candidate-options">
              <el-checkbox v-for="value in candidates[type]" :key="`${type}-${value}`"
                :model-value="Boolean(selected[type][String(value)])"
                @update:model-value="checked => setSelected(type, value, checked)"
                :label="String(value)" border size="small" />
            </div>
            <el-input v-model="customInputs[type]" size="small" placeholder="自定义" class="custom-input"
              @keyup.enter="addCustomValue(type)" />
            <el-button size="small" @click="addCustomValue(type)">添加</el-button>
          </div>

          <div v-for="(meta, label) in candidates.expression" :key="`expression-${label}`" class="candidate-row">
            <span class="candidate-label candidate-label-wide" :title="label">{{ label }}</span>
            <div class="candidate-options">
              <el-checkbox v-for="value in meta.options" :key="`${label}-${value}`"
                :model-value="Boolean(selected.expression[label]?.[String(value)])"
                @update:model-value="checked => setExpressionSelected(label, value, checked)"
                :label="String(value)" border size="small" />
            </div>
            <el-input v-model="customInputs.expression[label]" size="small" placeholder="自定义整数" class="custom-input"
              @keyup.enter="addExpressionValue(label)" />
            <el-button size="small" @click="addExpressionValue(label)">添加</el-button>
          </div>
          <div v-if="candidates.second_order.operators.length" class="candidate-row">
            <span class="candidate-label candidate-label-wide">二阶操作符</span>
            <div class="candidate-options">
              <el-checkbox v-for="value in candidates.second_order.operators" :key="`second-order-op-${value}`"
                :model-value="Boolean(selected.second_order.operators[String(value)])"
                @update:model-value="checked => setNestedSelected('second_order', 'operators', value, checked)"
                :label="value" border size="small" />
            </div>
          </div>

          <div v-if="candidates.second_order.group_fields.length" class="candidate-row">
            <span class="candidate-label candidate-label-wide">二阶中性化</span>
            <div class="candidate-options">
              <el-checkbox v-for="value in candidates.second_order.group_fields" :key="`second-order-field-${value}`"
                :model-value="Boolean(selected.second_order.group_fields[String(value)])"
                @update:model-value="checked => setNestedSelected('second_order', 'group_fields', value, checked)"
                :label="value" border size="small" />
            </div>
          </div>

          <div v-if="candidates.third_order.conditions.length" class="candidate-row">
            <span class="candidate-label candidate-label-wide">三阶条件</span>
            <div class="candidate-options">
              <el-checkbox v-for="value in candidates.third_order.conditions" :key="`third-order-cond-${value}`"
                :model-value="Boolean(selected.third_order.conditions[String(value)])"
                @update:model-value="checked => setNestedSelected('third_order', 'conditions', value, checked)"
                :label="value" border size="small" />
            </div>
          </div>

          <div v-if="candidates.third_order.exit_conditions.length" class="candidate-row">
            <span class="candidate-label candidate-label-wide">三阶退出条件</span>
            <div class="candidate-options">
              <el-checkbox v-for="value in candidates.third_order.exit_conditions" :key="`third-order-exit-${value}`"
                :model-value="Boolean(selected.third_order.exit_conditions[String(value)])"
                @update:model-value="checked => setNestedSelected('third_order', 'exit_conditions', value, checked)"
                :label="value" border size="small" />
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <div class="result-toolbar">
        <span>已选 <b>{{ selectedCount }}</b> 个候选，生成 <b>{{ variants.length }}</b> 个变体</span>
        <div>
          <el-button link type="warning" :disabled="!variants.some(row => row.strategy === 'expression_optimization')"
            @click="removeExpressionVariants">移除表达式变体</el-button>
          <el-button type="success" :loading="saving" :disabled="!newVariantCount" @click="saveRelations">确认入库</el-button>
          <el-button type="primary" :loading="taskActionLoading === 'enqueue'" :disabled="!savedVariantCount || Boolean(taskActionLoading)"
            @click="createBacktestTasks(false)">加入回测队列</el-button>
          <el-button type="danger" :loading="taskActionLoading === 'immediate'" :disabled="!savedVariantCount || Boolean(taskActionLoading)"
            @click="createBacktestTasks(true)">立即回测</el-button>
          <el-button link type="warning"
            :disabled="!variants.some(row => ['expression_optimization', 'second_order_optimization', 'third_order_optimization'].includes(row.strategy))"
            @click="removeHighOrderVariants">移除表达式/二三阶变体</el-button>
        </div>
      </div>

      <el-table v-if="variants.length" :data="variants" border stripe class="table">
        <el-table-column label="类型" width="100" align="center">
          <template #default="{ row }"><el-tag size="small" :type="strategyTagType(row.strategy)">{{ strategyLabel(row.strategy) }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="variant_alpha_id" label="变体 ID" min-width="200" show-overflow-tooltip />
        <el-table-column prop="change_desc" label="变化" min-width="210" />
        <el-table-column prop="expression" label="表达式" min-width="320" show-overflow-tooltip />
        <el-table-column prop="decay" label="Decay" width="80" align="center" />
        <el-table-column prop="truncation" label="Trunc" width="80" align="center" />
        <el-table-column prop="delay" label="Delay" width="75" align="center" />
        <el-table-column prop="universe" label="Universe" width="110" align="center" />
        <el-table-column label="重复" width="160" align="center">
          <template #default="{ row }">
            <el-checkbox v-if="row.already_exists && !relationIdOf(row)" v-model="forceDuplicates[row.variant_alpha_id]">确认重复入库</el-checkbox>
            <el-tag v-else-if="row.duplicate_of_relation_id" size="small" type="warning">重复入库</el-tag>
            <el-tag v-else size="small" type="success">非重复</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tooltip :content="row.error_message || taskStatusLabel(row)" :disabled="!row.error_message">
              <el-tag size="small" :type="taskStatusTagType(row)">{{ taskStatusLabel(row) }}</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="danger" @click="removeVariant(row)">移除</el-button>
            <el-tooltip content="需先入库并回测完成" :disabled="canUseAsBase(row)">
              <el-button link type="primary" :disabled="!canUseAsBase(row)" @click="useAsBase(row)">作为新基准</el-button>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无已生成变体" />
    </template>

    <el-empty v-else-if="!loading" description="请输入 Alpha ID 获取候选参数" />
  </el-card>
</template>

<style scoped>
.variant-page { min-width: 0; }
.page-header, .context-bar, .result-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.page-subtitle { margin-left: 12px; color: #909399; font-size: 13px; font-weight: 400; }
.source-input { width: 320px; }
.message { margin: 8px 0 16px; }
.context-bar { align-items: flex-start; flex-wrap: wrap; margin: 8px 0 12px; }
.chain, .source-settings, .candidate-options { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.source-settings { justify-content: flex-end; }
.muted { color: #909399; font-size: 12px; }
.chain-arrow { color: #c0c4cc; }
.expression-preview { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; margin-bottom: 12px; background: #f5f7fa; border: 1px solid #ebeef5; }
.expression-preview code { min-width: 0; color: #606266; font: 12px/1.5 Consolas, monospace; overflow-wrap: anywhere; }
.source-panel, .history-panel { margin: 0 0 12px; padding: 10px 12px; border: 1px solid #ebeef5; }
.history-header { display: flex; justify-content: space-between; margin-bottom: 8px; color: #606266; font-size: 13px; }
.history-header span { color: #909399; }
.history-sort { display: flex; align-items: center; gap: 8px; }
.history-sort .el-select:first-of-type { width: 130px; }
.history-sort .el-select:last-of-type { width: 90px; }
.candidate-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 0 8px; }
.candidate-actions b { color: #303133; }
.candidate-panel { margin-bottom: 16px; }
.candidate-row { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 8px 0; border-bottom: 1px solid #f0f2f5; }
.candidate-row:last-child { border-bottom: 0; }
.candidate-label { flex: 0 0 96px; color: #606266; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.candidate-label-wide { flex-basis: 190px; }
.candidate-options { flex: 1; min-width: 300px; }
.candidate-options :deep(.el-checkbox) { margin-right: 0; }
.custom-input { width: 115px; flex: 0 0 auto; }
.result-toolbar { margin: 12px 0; color: #606266; font-size: 13px; }
.result-toolbar > div { display: flex; align-items: center; gap: 4px; }
.table { margin-top: 8px; }
@media (max-width: 900px) {
  .candidate-row { align-items: flex-start; flex-wrap: wrap; }
  .candidate-label { flex-basis: 100%; }
  .candidate-options { min-width: 0; }
  .result-toolbar { align-items: flex-start; flex-direction: column; }
  .result-toolbar > div { flex-wrap: wrap; }
  .candidate-actions { align-items: flex-start; flex-direction: column; }
  .history-header { align-items: flex-start; flex-direction: column; gap: 8px; }
  .history-sort { flex-wrap: wrap; }
}
</style>
