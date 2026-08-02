import { config } from './config.js'

const width = config.paperWidth
const line = (char = '-') => char.repeat(width)
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const center = (value) => {
  const text = clean(value).slice(0, width)
  return `${' '.repeat(Math.max(0, Math.floor((width - text.length) / 2)))}${text}`
}
const destination = (order) => order?.table?.number ? `MESA ${order.table.number}` : clean(order?.customerName) || (order?.type === 'delivery' ? 'DELIVERY' : 'BALCAO')

function itemLines(item) {
  const lines = [`${item.quantity || 1}x ${clean(item?.product?.name || 'Produto')}`]
  const flavors = Array.isArray(item?.flavors) ? item.flavors : []
  if (flavors.length) lines.push(`  ${flavors.map((flavor) => `${flavors.length > 1 ? '1/2 ' : ''}${clean(flavor.nameApplied || flavor.flavor?.name)}`).join(' + ')}`)
  for (const selected of item?.options || []) lines.push(`  + ${selected.quantity || 1}x ${clean(selected.option?.name || 'Adicional')}`)
  if (clean(item?.notes)) lines.push(`  OBS: ${clean(item.notes)}`)
  return lines
}

export function buildReceipt(order, items, { addition = false } = {}) {
  const createdAt = new Date(order.createdAt || Date.now()).toLocaleString('pt-BR')
  const output = [
    center('CHEFITO - PRODUCAO'),
    center(addition ? '*** COMPLEMENTO ***' : 'NOVO PEDIDO'),
    line('='),
    `PEDIDO #${String(order.id).padStart(4, '0')}`,
    destination(order),
    order.waiter?.name ? `GARCOM: ${clean(order.waiter.name)}` : '',
    `CRIADO: ${createdAt}`,
    line(),
  ].filter(Boolean)

  items.forEach((item, index) => {
    if (index) output.push(line())
    output.push(...itemLines(item))
  })
  if (clean(order.notes)) output.push(line(), `OBS. PEDIDO: ${clean(order.notes)}`)
  output.push(line('='), center('FIM DO PEDIDO'), '', '', '')
  return output.join('\n')
}
