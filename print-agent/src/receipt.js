import { config } from './config.js'

const width = config.paperWidth
const line = (char = '-') => char.repeat(width)
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const center = (value) => {
  const text = clean(value).slice(0, width)
  return `${' '.repeat(Math.max(0, Math.floor((width - text.length) / 2)))}${text}`
}
const destination = (order) => {
  if (order?.table?.number) return `MESA ${order.table.number}`
  const customer = clean(order?.customerName)
  if (order?.type === 'delivery') return customer ? `DELIVERY - ${customer}` : 'DELIVERY'
  if (order?.type === 'pickup') return customer ? `RETIRADA - ${customer}` : 'RETIRADA'
  return customer ? `BALCAO - ${customer}` : 'BALCAO'
}

function itemLines(item) {
  const lines = [`${item.quantity || 1}x ${clean(item?.product?.name || 'Produto')}${item?.variantNameApplied ? ` (${clean(item.variantNameApplied)})` : ''}`]
  const flavors = Array.isArray(item?.flavors) ? item.flavors : []
  if (flavors.length) lines.push(`  ${flavors.map((flavor) => `${flavors.length > 1 ? '1/2 ' : ''}${clean(flavor.nameApplied || flavor.flavor?.name)}`).join(' + ')}`)
  for (const selected of item?.options || []) {
    const groupName = clean(selected.option?.group?.name)
    const optionName = clean(selected.option?.name || 'Adicional')
    lines.push(`  + ${groupName ? `${groupName}: ` : ''}${selected.quantity || 1}x ${optionName}`)
  }
  if (clean(item?.notes)) lines.push(`  OBS: ${clean(item.notes)}`)
  return lines
}

export function buildReceipt(order, items, { addition = false } = {}) {
  const createdAt = new Date(order.createdAt || Date.now()).toLocaleString('pt-BR')
  const companyName = clean(order?.tenant?.name) || 'EMPRESA'
  const output = [
    center(companyName),
    center('PRODUCAO'),
    center(addition ? '*** COMPLEMENTO ***' : 'NOVO PEDIDO'),
    line('='),
    `PEDIDO #${String(order.dailyNumber ?? order.id).padStart(4, '0')}`,
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
  output.push(line('='), center('FIM DO PEDIDO - by Chetito'), '', '', '')
  return output.join('\n')
}

const money = (value) => `R$ ${(Number(value) || 0).toFixed(2).replace('.', ',')}`

const paymentLabels = { cash: 'Dinheiro', pix: 'PIX', debit_card: 'Cartao de Debito', credit_card: 'Cartao de Credito' }

function itemsAndExtrasLines(order) {
  const output = []
  for (const [index, item] of (order.items || []).entries()) {
    if (index) output.push(line())
    const quantity = Math.max(1, Number(item.quantity) || 1)
    const optionsTotal = (item.options || []).reduce((sum, option) => sum + (Number(option.priceAdded) || 0) * Math.max(1, Number(option.quantity) || 1), 0)
    const lineTotal = ((Number(item.unitPrice) || 0) + optionsTotal) * quantity
    output.push(`${quantity}x ${clean(item?.product?.name || 'Produto')}${item.variantNameApplied ? ` (${clean(item.variantNameApplied)})` : ''}`)
    for (const flavor of item.flavors || []) output.push(`  ${item.flavors.length > 1 ? '1/2 ' : ''}${clean(flavor.nameApplied)}`)
    for (const option of item.options || []) {
      const groupName = clean(option.option?.group?.name)
      const optionName = clean(option.option?.name || 'Adicional')
      output.push(`  + ${groupName ? `${groupName}: ` : ''}${option.quantity || 1}x ${optionName} ${money((Number(option.priceAdded) || 0) * (option.quantity || 1))}`)
    }
    if (clean(item.notes)) output.push(`  OBS: ${clean(item.notes)}`)
    output.push(`${' '.repeat(Math.max(1, width - money(lineTotal).length))}${money(lineTotal)}`)
  }
  if (order.extras?.length) {
    output.push(line(), 'VALORES EXTRAS')
    for (const extra of order.extras) {
      const quantity = Math.max(1, Number(extra.quantity) || 1)
      const extraTotal = quantity * (Number(extra.unitPrice) || 0)
      output.push(`${quantity}x ${clean(extra.description)}`, `${' '.repeat(Math.max(1, width - money(extraTotal).length))}${money(extraTotal)}`)
    }
  }
  return output
}

export function buildCustomerBill(order) {
  const createdAt = new Date(order.createdAt || Date.now()).toLocaleString('pt-BR')
  const output = [
    center(clean(order?.tenant?.name) || 'EMPRESA'),
    center('CONTA PARA CONFERENCIA'),
    line('='),
    `PEDIDO #${String(order.dailyNumber ?? order.id).padStart(4, '0')}`,
    destination(order),
    order.waiter?.name ? `GARCOM: ${clean(order.waiter.name)}` : '',
    `ABERTO: ${createdAt}`,
    line(),
  ].filter(Boolean)

  output.push(...itemsAndExtrasLines(order))
  if (clean(order.notes)) output.push(line(), `OBS. PEDIDO: ${clean(order.notes)}`)
  if (Number(order.deliveryFee) > 0) output.push(line(), `TAXA DE ENTREGA: ${money(order.deliveryFee)}`)
  if (Number(order.discountAmount) > 0) output.push(`DESCONTO: -${money(order.discountAmount)}`)
  output.push(line('='), `TOTAL: ${money(order.total)}`, line('='))
  output.push(center(order.paidAt ? 'PAGAMENTO REGISTRADO' : 'PAGAMENTO PENDENTE'), center('NAO E DOCUMENTO FISCAL'), '', '', '')
  return output.join('\n')
}

export function buildPaymentReceipt(order) {
  const paidAt = new Date(order.paidAt || Date.now()).toLocaleString('pt-BR')
  const output = [
    center(clean(order?.tenant?.name) || 'EMPRESA'),
    center('RECIBO DE PAGAMENTO'),
    line('='),
    `PEDIDO #${String(order.dailyNumber ?? order.id).padStart(4, '0')}`,
    destination(order),
    order.waiter?.name ? `GARCOM: ${clean(order.waiter.name)}` : '',
    `PAGO EM: ${paidAt}`,
    line(),
  ].filter(Boolean)

  output.push(...itemsAndExtrasLines(order))
  if (clean(order.notes)) output.push(line(), `OBS. PEDIDO: ${clean(order.notes)}`)
  if (Number(order.deliveryFee) > 0) output.push(line(), `TAXA DE ENTREGA: ${money(order.deliveryFee)}`)
  if (Number(order.discountAmount) > 0) output.push(`DESCONTO: -${money(order.discountAmount)}`)
  output.push(line('='), `TOTAL PAGO: ${money(order.total)}`, line('='))
  output.push(`FORMA DE PAGAMENTO: ${paymentLabels[order.paymentMethodType] || 'Nao informada'}`)
  output.push(center('PAGAMENTO CONFIRMADO'), center('NAO E DOCUMENTO FISCAL'), '', '', '')
  return output.join('\n')
}
