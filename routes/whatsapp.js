import express from 'express'
import { PrismaClient } from '@prisma/client'
import authMiddleware from '../middlewares/auth.js'
import { encryptCredential } from '../utils/credentialCrypto.js'

const prisma = new PrismaClient()
const router = express.Router()

const evolutionUrl = () => String(process.env.EVOLUTION_API_URL || process.env.URL_EVOLUTION || '').replace(/\/+$/, '')
const evolutionKey = () => process.env.EVOLUTION_API_KEY || process.env.AUTHENTICATION_API_KEY || ''

function evolutionErrorText(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(evolutionErrorText).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    if (value.message != null) return evolutionErrorText(value.message)
    return Object.entries(value).map(([key, item]) => `${key}: ${evolutionErrorText(item)}`).filter((item) => !item.endsWith(': ')).join(', ')
  }
  return String(value)
}

async function ownedTenant(tenantId, userId) {
  return prisma.tenant.findFirst({ where: { id: tenantId, ownerId: userId }, select: { id: true, slug: true } })
}

function officialView(channel) {
  return {
    configured: Boolean(channel?.wabaId && channel?.phoneNumberId && channel?.accessTokenEncrypted && channel?.appSecretEncrypted),
    active: channel ? Boolean(channel.active) : true, status: channel?.status || 'disconnected',
    wabaId: channel?.wabaId || '', phoneNumberId: channel?.phoneNumberId || '',
    hasToken: Boolean(channel?.accessTokenEncrypted), hasAppSecret: Boolean(channel?.appSecretEncrypted),
    selectedForMessaging: Boolean(channel?.selectedForMessaging),
    updatedAt: channel?.updatedAt || null,
  }
}

function evolutionView(channel) {
  return {
    configured: Boolean(channel?.evolutionInstanceName), active: Boolean(channel?.active),
    status: channel?.status || 'disconnected', instanceName: channel?.evolutionInstanceName || '',
    instanceId: channel?.evolutionInstanceId || '', connectedNumber: channel?.connectedNumber || '',
    selectedForMessaging: Boolean(channel?.selectedForMessaging),
    serverConfigured: Boolean(evolutionUrl() && evolutionKey()), updatedAt: channel?.updatedAt || null,
  }
}

async function evolutionRequest(path, init = {}) {
  if (!evolutionUrl() || !evolutionKey()) throw Object.assign(new Error('Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no backend'), { status: 503 })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(`${evolutionUrl()}${path}`, {
      ...init, signal: controller.signal,
      headers: { apikey: evolutionKey(), 'Content-Type': 'application/json', ...(init.headers || {}) },
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const message = body?.response?.message || body?.message || body?.error || `Evolution API respondeu ${response.status}`
      const messageText = evolutionErrorText(message) || `Evolution API respondeu ${response.status}`
      if (messageText.includes('/api/errors/not-started')) {
        throw Object.assign(new Error('A Evolution API está parada ou indisponível no servidor. Inicie o serviço e aguarde o status ficar saudável antes de gerar o QR Code.'), { status: 503 })
      }
      throw Object.assign(new Error(messageText), { status: response.status })
    }
    return body
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('Evolution API não respondeu a tempo'), { status: 504 })
    throw error
  } finally { clearTimeout(timeout) }
}

function instanceName(tenant) {
  const base = `chefito-${tenant.slug}-${tenant.id.slice(0, 8)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
  return base.slice(0, 60)
}

function qrImage(value) {
  if (!value || typeof value !== 'string') return ''
  return value.startsWith('data:image/') ? value : `data:image/png;base64,${value}`
}

async function findChannels(tenantId) {
  const channels = await prisma.whatsAppChannel.findMany({ where: { tenantId } })
  return {
    official: channels.find((item) => item.provider === 'official'),
    evolution: channels.find((item) => item.provider === 'evolution'),
  }
}

router.get('/tenant/:tenantId/whatsapp-channel', authMiddleware, async (req, res) => {
  try {
    if (!(await ownedTenant(req.params.tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const channels = await findChannels(req.params.tenantId)
    res.json({ official: officialView(channels.official), evolution: evolutionView(channels.evolution) })
  } catch (error) {
    console.error('Erro ao listar canais WhatsApp:', error)
    if (['P2021', 'P2022'].includes(error.code)) {
      return res.status(503).json({ error: 'Banco de dados desatualizado. Execute as migrations do WhatsApp no backend.' })
    }
    res.status(500).json({ error: 'Erro ao carregar configuração do WhatsApp' })
  }
})

router.put('/tenant/:tenantId/whatsapp-channel/official', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId
    if (!(await ownedTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const current = await prisma.whatsAppChannel.findUnique({ where: { tenantId_provider: { tenantId, provider: 'official' } } })
    const wabaId = String(req.body.wabaId || '').trim()
    const phoneNumberId = String(req.body.phoneNumberId || '').trim()
    const accessToken = String(req.body.accessToken || '').trim()
    const appSecret = String(req.body.appSecret || '').trim()
    if (!wabaId || !phoneNumberId) return res.status(400).json({ error: 'WABA ID e Number ID são obrigatórios' })
    if (!current && (!accessToken || !appSecret)) return res.status(400).json({ error: 'Token e App Secret são obrigatórios na primeira configuração' })
    const data = {
      wabaId, phoneNumberId, active: req.body.active !== false,
      status: req.body.active === false ? 'disabled' : 'configured',
      ...(accessToken ? { accessTokenEncrypted: encryptCredential(accessToken) } : {}),
      ...(appSecret ? { appSecretEncrypted: encryptCredential(appSecret) } : {}),
    }
    const channel = await prisma.whatsAppChannel.upsert({
      where: { tenantId_provider: { tenantId, provider: 'official' } },
      create: { tenantId, provider: 'official', ...data }, update: data,
    })
    res.json({ official: officialView(channel) })
  } catch (error) {
    console.error('Erro ao salvar canal oficial:', error)
    res.status(500).json({ error: error.message === 'CHANNEL_ENCRYPTION_KEY não configurada' ? error.message : 'Erro ao salvar configuração oficial' })
  }
})

router.post('/tenant/:tenantId/whatsapp-channel/evolution/connect', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId
    const tenant = await ownedTenant(tenantId, req.userId)
    if (!tenant) return res.status(403).json({ error: 'Acesso negado à empresa' })
    let channel = await prisma.whatsAppChannel.findUnique({ where: { tenantId_provider: { tenantId, provider: 'evolution' } } })
    const name = channel?.evolutionInstanceName || instanceName(tenant)
    let result
    if (!channel?.evolutionInstanceName) {
      try {
        result = await evolutionRequest('/instance/create', { method: 'POST', body: JSON.stringify({ instanceName: name, qrcode: true, integration: 'WHATSAPP-BAILEYS' }) })
      } catch (error) {
        if (![403, 409].includes(error.status)) throw error
      }
    }
    if (!result?.qrcode?.base64 && !result?.base64) result = await evolutionRequest(`/instance/connect/${encodeURIComponent(name)}`)
    channel = await prisma.whatsAppChannel.upsert({
      where: { tenantId_provider: { tenantId, provider: 'evolution' } },
      create: { tenantId, provider: 'evolution', active: true, status: 'connecting', evolutionInstanceName: name, evolutionInstanceId: result?.instance?.instanceId || null },
      update: { active: true, status: 'connecting', evolutionInstanceName: name, ...(result?.instance?.instanceId ? { evolutionInstanceId: result.instance.instanceId } : {}) },
    })
    res.json({ evolution: evolutionView(channel), qrCode: qrImage(result?.qrcode?.base64 || result?.base64), pairingCode: result?.pairingCode || '' })
  } catch (error) {
    console.error('Erro ao conectar Evolution API:', error)
    res.status(error.status >= 400 && error.status < 600 ? error.status : 500).json({ error: error.message || 'Erro ao gerar QR Code' })
  }
})

router.get('/tenant/:tenantId/whatsapp-channel/evolution/status', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId
    if (!(await ownedTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const channel = await prisma.whatsAppChannel.findUnique({ where: { tenantId_provider: { tenantId, provider: 'evolution' } } })
    if (!channel?.evolutionInstanceName) return res.json({ evolution: evolutionView(channel) })
    const result = await evolutionRequest(`/instance/connectionState/${encodeURIComponent(channel.evolutionInstanceName)}`)
    const rawState = result?.instance?.state || result?.state || 'disconnected'
    const status = rawState === 'open' ? 'connected' : rawState === 'connecting' ? 'connecting' : 'disconnected'
    const updated = await prisma.whatsAppChannel.update({ where: { id: channel.id }, data: { status, active: status !== 'disconnected' } })
    res.json({ evolution: evolutionView(updated) })
  } catch (error) {
    console.error('Erro ao consultar Evolution API:', error)
    res.status(error.status >= 400 && error.status < 600 ? error.status : 500).json({ error: error.message || 'Erro ao consultar conexão' })
  }
})

router.delete('/tenant/:tenantId/whatsapp-channel/evolution', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId
    if (!(await ownedTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const channel = await prisma.whatsAppChannel.findUnique({ where: { tenantId_provider: { tenantId, provider: 'evolution' } } })
    if (channel?.evolutionInstanceName) await evolutionRequest(`/instance/delete/${encodeURIComponent(channel.evolutionInstanceName)}`, { method: 'DELETE' })
    if (channel) await prisma.whatsAppChannel.delete({ where: { id: channel.id } })
    res.status(204).end()
  } catch (error) {
    console.error('Erro ao remover canal Evolution:', error)
    res.status(error.status >= 400 && error.status < 600 ? error.status : 500).json({ error: error.message || 'Erro ao desconectar WhatsApp' })
  }
})

router.put('/tenant/:tenantId/whatsapp-messaging/channel', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId
    if (!(await ownedTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const provider = String(req.body.provider || '')
    if (!['official', 'evolution'].includes(provider)) return res.status(400).json({ error: 'Canal inválido' })
    const channel = await prisma.whatsAppChannel.findUnique({ where: { tenantId_provider: { tenantId, provider } } })
    if (!channel?.active) return res.status(400).json({ error: 'O canal precisa estar configurado e ativo' })
    if (provider === 'evolution' && channel.status !== 'connected') return res.status(400).json({ error: 'Conecte o WhatsApp pelo QR Code antes de selecionar este canal' })
    await prisma.$transaction([
      prisma.whatsAppChannel.updateMany({ where: { tenantId }, data: { selectedForMessaging: false } }),
      prisma.whatsAppChannel.update({ where: { id: channel.id }, data: { selectedForMessaging: true, messagingStartedAt: new Date() } }),
    ])
    res.json({ provider })
  } catch (error) {
    console.error('Erro ao selecionar canal WhatsApp:', error)
    res.status(500).json({ error: 'Erro ao selecionar canal de mensagens' })
  }
})

async function messagingChannel(tenantId) {
  return prisma.whatsAppChannel.findFirst({
    where: { tenantId, selectedForMessaging: true, active: true },
  })
}

function evolutionTimestamp(value) {
  const number = Number(value)
  const date = Number.isFinite(number) && number > 0
    ? new Date(number < 1e12 ? number * 1000 : number)
    : value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function chatActivityAt(chat) {
  return evolutionTimestamp(chat?.lastMessage?.messageTimestamp || chat?.lastMessage?.timestamp || chat?.messageTimestamp || chat?.updatedAt)
}

function canonicalChatJid(chat) {
  return String(chat?.remoteJidAlt || chat?.lastMessage?.key?.remoteJidAlt || chat?.lastMessage?.contextInfo?.participant || chat?.remoteJid || chat?.id || '').trim()
}

function chatLastMessageFromMe(chat) {
  return Boolean(chat?.lastMessage?.key?.fromMe ?? chat?.lastMessage?.fromMe)
}

function messageActivityAt(message) {
  return evolutionTimestamp(message?.messageTimestamp || message?.timestamp || message?.createdAt || message?.updatedAt)
}

router.get('/tenant/:tenantId/whatsapp-messaging/chats', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId
    if (!(await ownedTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const channel = await messagingChannel(tenantId)
    if (!channel) return res.status(409).json({ error: 'Selecione um canal para atendimento' })
    if (channel.provider !== 'evolution') return res.status(501).json({ error: 'A caixa da API oficial será disponibilizada na próxima etapa' })
    const chats = await evolutionRequest(`/chat/findChats/${encodeURIComponent(channel.evolutionInstanceName)}`, {
      method: 'POST', body: JSON.stringify({ where: {}, take: 100, skip: 0, orderBy: { updatedAt: 'desc' } }),
    })
    const allChats = Array.isArray(chats) ? chats : chats?.records || chats?.chats || []
    const startedAt = channel.messagingStartedAt || channel.updatedAt
    const conversationStates = await prisma.whatsAppConversationState.findMany({
      where: { tenantId, provider: channel.provider },
      select: { contactJid: true, archivedAt: true, readAt: true },
    })
    const stateByContact = new Map(conversationStates.map((state) => [state.contactJid, state]))
    const reopenedContacts = new Set()
    const visibleChats = startedAt ? allChats.filter((chat) => {
      const activityAt = chatActivityAt(chat)
      if (!activityAt || activityAt < startedAt) return false
      const contactJid = canonicalChatJid(chat)
      const archivedAt = stateByContact.get(contactJid)?.archivedAt
      if (!archivedAt) return true
      const reopened = !chatLastMessageFromMe(chat) && activityAt > archivedAt
      if (reopened) reopenedContacts.add(contactJid)
      return reopened
    }) : []
    if (reopenedContacts.size) {
      await prisma.whatsAppConversationState.updateMany({
        where: { tenantId, provider: channel.provider, contactJid: { in: [...reopenedContacts] } }, data: { archivedAt: null },
      })
    }
    const chatsWithLocalReadState = visibleChats.map((chat) => {
      const activityAt = chatActivityAt(chat)
      const readAt = stateByContact.get(canonicalChatJid(chat))?.readAt
      if (chatLastMessageFromMe(chat)) return { ...chat, unreadMessages: 0, unreadCount: 0 }
      if (!readAt || !activityAt || activityAt > readAt) return chat
      return { ...chat, unreadMessages: 0, unreadCount: 0 }
    })
    res.json({ provider: channel.provider, instanceName: channel.evolutionInstanceName, startedAt, chats: chatsWithLocalReadState })
  } catch (error) {
    console.error('Erro ao carregar conversas:', error)
    res.status(error.status >= 400 && error.status < 600 ? error.status : 500).json({ error: error.message || 'Erro ao carregar conversas' })
  }
})

router.post('/tenant/:tenantId/whatsapp-messaging/chats/archive', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId
    if (!(await ownedTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const contactJid = String(req.body.contactJid || '').trim()
    if (!contactJid || contactJid.length > 160) return res.status(400).json({ error: 'Contato inválido' })
    const channel = await messagingChannel(tenantId)
    if (!channel) return res.status(409).json({ error: 'Selecione um canal para atendimento' })
    await prisma.whatsAppConversationState.upsert({
      where: { tenantId_provider_contactJid: { tenantId, provider: channel.provider, contactJid } },
      create: { tenantId, provider: channel.provider, contactJid, archivedAt: new Date() },
      update: { archivedAt: new Date() },
    })
    res.json({ archived: true, contactJid })
  } catch (error) {
    console.error('Erro ao arquivar conversa:', error)
    res.status(500).json({ error: 'Erro ao arquivar conversa' })
  }
})

router.post('/tenant/:tenantId/whatsapp-messaging/chats/read', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId
    if (!(await ownedTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const remoteJid = String(req.body.remoteJid || '').trim()
    const contactJid = String(req.body.contactJid || remoteJid).trim()
    const id = String(req.body.id || '').trim()
    if (!remoteJid || !contactJid || !id) return res.status(400).json({ error: 'Mensagem não informada' })
    const channel = await messagingChannel(tenantId)
    if (!channel) return res.status(409).json({ error: 'Selecione um canal para atendimento' })
    if (channel.provider !== 'evolution') return res.status(501).json({ error: 'Canal ainda não suportado' })
    await prisma.whatsAppConversationState.upsert({
      where: { tenantId_provider_contactJid: { tenantId, provider: channel.provider, contactJid } },
      create: { tenantId, provider: channel.provider, contactJid, readAt: new Date() },
      update: { readAt: new Date() },
    })
    try {
      await evolutionRequest(`/chat/markMessageAsRead/${encodeURIComponent(channel.evolutionInstanceName)}`, {
        method: 'POST',
        body: JSON.stringify({ readMessages: [{ remoteJid, id, fromMe: Boolean(req.body.fromMe) }] }),
      })
    } catch (error) {
      console.warn('Evolution não confirmou a leitura; estado local foi mantido:', error.message)
    }
    res.json({ read: true })
  } catch (error) {
    console.error('Erro ao marcar conversa como lida:', error)
    res.status(error.status >= 400 && error.status < 600 ? error.status : 500).json({ error: error.message || 'Erro ao marcar conversa como lida' })
  }
})

router.get('/tenant/:tenantId/whatsapp-messaging/messages', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId
    if (!(await ownedTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const remoteJid = String(req.query.remoteJid || '').trim()
    const numberJid = String(req.query.numberJid || '').trim()
    if (!remoteJid) return res.status(400).json({ error: 'Conversa não informada' })
    const channel = await messagingChannel(tenantId)
    if (!channel) return res.status(409).json({ error: 'Selecione um canal para atendimento' })
    if (channel.provider !== 'evolution') return res.status(501).json({ error: 'Canal ainda não suportado na caixa de mensagens' })
    const jids = [...new Set([remoteJid, numberJid].filter(Boolean))]
    const results = await Promise.all(jids.map((jid) => evolutionRequest(`/chat/findMessages/${encodeURIComponent(channel.evolutionInstanceName)}`, {
      method: 'POST', body: JSON.stringify({ where: { key: { remoteJid: jid } }, page: 1, offset: 100 }),
    })))
    const messages = results.flatMap((result) => Array.isArray(result) ? result : result?.messages?.records || result?.records || result?.messages || [])
    const uniqueMessages = [...new Map(messages.map((message, index) => [message?.key?.id || message?.id || `${messageActivityAt(message)?.getTime() || 0}-${index}`, message])).values()]
    const startedAt = channel.messagingStartedAt || channel.updatedAt
    const visibleMessages = startedAt ? uniqueMessages.filter((message) => {
      const activityAt = messageActivityAt(message)
      return activityAt && activityAt >= startedAt
    }) : []
    res.json({ startedAt, messages: visibleMessages })
  } catch (error) {
    console.error('Erro ao carregar mensagens:', error)
    res.status(error.status >= 400 && error.status < 600 ? error.status : 500).json({ error: error.message || 'Erro ao carregar mensagens' })
  }
})

router.post('/tenant/:tenantId/whatsapp-messaging/messages', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId
    if (!(await ownedTenant(tenantId, req.userId))) return res.status(403).json({ error: 'Acesso negado à empresa' })
    const remoteJid = String(req.body.remoteJid || '').trim()
    const numberJid = String(req.body.numberJid || remoteJid).trim()
    const text = String(req.body.text || '').trim()
    if (!remoteJid || !text) return res.status(400).json({ error: 'Conversa e mensagem são obrigatórias' })
    if (text.length > 4096) return res.status(400).json({ error: 'A mensagem deve ter no máximo 4096 caracteres' })
    const channel = await messagingChannel(tenantId)
    if (!channel) return res.status(409).json({ error: 'Selecione um canal para atendimento' })
    if (channel.provider !== 'evolution') return res.status(501).json({ error: 'Canal ainda não suportado para envio' })
    if (remoteJid.endsWith('@lid') && (!numberJid || numberJid.endsWith('@lid'))) return res.status(400).json({ error: 'A Evolution não informou o telefone real associado a esta conversa LID' })
    const number = numberJid.replace(/@(s\.whatsapp\.net|c\.us)$/i, '').replace(/\D/g, '')
    if (!number) return res.status(400).json({ error: 'Número da conversa inválido' })
    const result = await evolutionRequest(`/message/sendText/${encodeURIComponent(channel.evolutionInstanceName)}`, {
      method: 'POST', body: JSON.stringify({ number, text }),
    })
    res.status(201).json(result)
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error)
    res.status(error.status >= 400 && error.status < 600 ? error.status : 500).json({ error: error.message || 'Erro ao enviar mensagem' })
  }
})

export default router
