const statusLabels = {
  pending: 'Aguardando confirmação', confirmed: 'Pedido confirmado', preparing: 'Em produção', ready: 'Pronto',
  out_for_delivery: 'Saiu para entrega', delivered: 'Entregue', cancelled: 'Cancelado', returned: 'Devolvido',
}

const paymentLabels = { cash: 'Dinheiro', pix: 'PIX', debit_card: 'Cartão de débito', credit_card: 'Cartão de crédito' }
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)

function whatsappNumber(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length >= 12 && digits.length <= 13 ? digits : ''
}

async function selectedEvolutionChannel(prisma, tenantId) {
  return prisma.whatsAppChannel.findFirst({
    where: { tenantId, provider: 'evolution', selectedForMessaging: true, active: true },
    select: { evolutionInstanceName: true },
  })
}

async function sendEvolutionText(prisma, order, text) {
  const number = whatsappNumber(order?.customerPhone)
  if (!number) return { sent: false, reason: 'customer_phone_missing' }
  const channel = await selectedEvolutionChannel(prisma, order.tenantId)
  if (!channel?.evolutionInstanceName) return { sent: false, reason: 'channel_missing' }
  const baseUrl = String(process.env.EVOLUTION_API_URL || process.env.URL_EVOLUTION || '').replace(/\/+$/, '')
  const apiKey = process.env.EVOLUTION_API_KEY || process.env.AUTHENTICATION_API_KEY || ''
  if (!baseUrl || !apiKey) return { sent: false, reason: 'environment_missing' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(channel.evolutionInstanceName)}`, {
      method: 'POST', signal: controller.signal,
      headers: { apikey: apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ number, text }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Evolution ${response.status}: ${body.slice(0, 300)}`)
    }
    return { sent: true }
  } finally { clearTimeout(timeout) }
}

export async function notifyOrderCreated(prisma, order) {
  try {
    const company = order?.tenant?.name || 'Nossa loja'
    const items = (order?.items || []).map((item) => {
      const flavors = (item.flavors || []).map((flavor) => flavor.nameApplied).filter(Boolean)
      const options = (item.options || []).map((option) => option.option?.name).filter(Boolean)
      return `• ${item.quantity || 1}x ${item.product?.name || 'Produto'}${item.variantNameApplied ? ` (${item.variantNameApplied})` : ''}${flavors.length ? ` (${flavors.join(' + ')})` : ''}${options.length ? ` + ${options.join(', ')}` : ''}`
    })
    const text = [
      `Olá, ${order.customerName || 'cliente'}! 👋`, `Recebemos seu pedido #${String(order.id).padStart(4, '0')} na ${company}.`, '',
      ...items, '', `Total: ${money(order.total)}`, `Entrega: ${order.type === 'delivery' ? 'Delivery' : 'Retirada'}`,
      `Pagamento na entrega/retirada: ${paymentLabels[order.paymentMethodType] || 'A combinar'}`,
      `Status: ${statusLabels[order.status] || order.status}`, '', 'Avisaremos por aqui quando o status mudar.',
    ].join('\n')
    await sendEvolutionText(prisma, order, text)
  } catch (error) { console.error(`Falha ao notificar criação do pedido #${order?.id}:`, error.message) }
}

export async function notifyOrderStatusChanged(prisma, order) {
  try {
    const text = [`🔔 Atualização do pedido #${String(order.id).padStart(4, '0')}`, '', `Novo status: *${statusLabels[order.status] || order.status}*`, '', order.status === 'ready' ? (order.type === 'delivery' ? 'Seu pedido está pronto e em breve seguirá para entrega.' : 'Seu pedido está pronto para retirada!') : order.status === 'out_for_delivery' ? 'Seu pedido está a caminho! 🛵' : order.status === 'delivered' ? 'Pedido concluído. Agradecemos pela preferência! 😊' : 'Continuaremos avisando por aqui.'].join('\n')
    await sendEvolutionText(prisma, order, text)
  } catch (error) { console.error(`Falha ao notificar status do pedido #${order?.id}:`, error.message) }
}
