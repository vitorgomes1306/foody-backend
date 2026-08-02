import { config, validateConfig } from './config.js'
import { printText } from './printer.js'
import { buildReceipt } from './receipt.js'
import { loadState, saveState } from './state.js'

let token = ''
let running = false

async function request(path, options = {}, retry = true) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  })
  if (response.status === 401 && retry) {
    await login()
    return request(path, options, false)
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`)
  return body
}

async function login() {
  const response = await fetch(`${config.apiUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: config.email, password: config.password }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.token) throw new Error(body?.error || `Falha ao autenticar (HTTP ${response.status})`)
  token = body.token
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] Agente autenticado.`)
}

const productionItems = (order) => (order.items || []).filter((item) => !item?.product?.skipKds)

function batches(orders, printed) {
  const result = []
  for (const order of orders || []) {
    if (['delivered', 'cancelled', 'returned'].includes(order.status)) continue
    const original = productionItems(order).filter((item) => !item.addedAt)
    const originalKey = `order:${order.id}:original`
    if (order.status === 'preparing' && original.length && !printed.has(originalKey)) result.push({ key: originalKey, order, items: original, addition: false })

    const additions = productionItems(order).filter((item) => item.addedAt && item.kitchenStatus === 'preparing' && !printed.has(`item:${item.id}`))
    if (additions.length) result.push({ key: additions.map((item) => `item:${item.id}`), order, items: additions, addition: true })
  }
  return result
}

async function poll(state) {
  if (running) return
  running = true
  try {
    const orders = await request(`/api/tenant/${encodeURIComponent(config.tenantId)}/orders`)
    const pending = batches(orders, state.printed)
    if (!state.initialized && !config.printExistingOnFirstRun) {
      for (const batch of pending) for (const key of Array.isArray(batch.key) ? batch.key : [batch.key]) state.printed.add(key)
      await saveState(state)
      console.log('Sincronização inicial concluída. Pedidos que já estavam em produção não foram impressos.')
      return
    }
    for (const batch of pending) {
      await printText(buildReceipt(batch.order, batch.items, { addition: batch.addition }))
      for (const key of Array.isArray(batch.key) ? batch.key : [batch.key]) state.printed.add(key)
      await saveState(state)
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] Pedido #${batch.order.id}${batch.addition ? ' (complemento)' : ''} impresso.`)
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString('pt-BR')}] ${error.message}`)
  } finally {
    running = false
  }
}

try {
  validateConfig()
  const state = await loadState()
  await login()
  console.log(`Chefito Print Agent iniciado em modo ${config.printMode}. Consulta a cada ${config.pollIntervalMs}ms.`)
  await poll(state)
  setInterval(() => void poll(state), config.pollIntervalMs)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
