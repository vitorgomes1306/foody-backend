import crypto from 'node:crypto'
import express from 'express'
import { PrismaClient } from '@prisma/client'
import { decryptCredential } from '../utils/credentialCrypto.js'

const prisma = new PrismaClient()
const router = express.Router()

const verifyToken = () => process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || ''
const evolutionWebhookSecret = () => process.env.EVOLUTION_WEBHOOK_SECRET || ''

function constantTimeEqual(received, expected) {
  const left = Buffer.from(String(received || ''))
  const right = Buffer.from(String(expected || ''))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function officialEventInfo(payload) {
  const change = payload?.entry?.[0]?.changes?.[0]
  const value = change?.value
  return {
    eventType: String(change?.field || payload?.object || 'unknown'),
    externalId: value?.messages?.[0]?.id || value?.statuses?.[0]?.id || null,
  }
}

function evolutionEventInfo(payload) {
  const data = payload?.data || payload
  return {
    eventType: String(payload?.event || data?.event || 'unknown').toLowerCase(),
    externalId: data?.key?.id || data?.message?.key?.id || data?.id || null,
  }
}

function evolutionInstance(payload) {
  const data = payload?.data || {}
  return String(payload?.instance || payload?.instanceName || data?.instance || data?.instanceName || '').trim()
}

router.get('/api/webhooks/whatsapp/evolution', (_req, res) => {
  res.json({ ok: true, provider: 'evolution', webhookSecretConfigured: Boolean(evolutionWebhookSecret()) })
})

router.post('/api/webhooks/whatsapp/evolution', async (req, res) => {
  try {
    if (!evolutionWebhookSecret()) return res.status(503).json({ error: 'EVOLUTION_WEBHOOK_SECRET não configurado no backend' })
    if (!constantTimeEqual(req.get('x-webhook-secret'), evolutionWebhookSecret())) return res.status(401).json({ error: 'Assinatura do webhook Evolution inválida' })
    const instance = evolutionInstance(req.body)
    if (!instance) return res.status(400).json({ error: 'Instância não informada no evento' })
    const channel = await prisma.whatsAppChannel.findFirst({
      where: { provider: 'evolution', evolutionInstanceName: instance }, select: { tenantId: true },
    })
    if (!channel) return res.status(404).json({ error: 'Instância não vinculada a uma empresa' })
    const event = evolutionEventInfo(req.body)
    const saved = await prisma.whatsAppWebhookEvent.create({
      data: { tenantId: channel.tenantId, provider: 'evolution', eventType: event.eventType, externalId: event.externalId, payload: req.body },
      select: { id: true },
    })
    res.status(202).json({ received: true, eventId: saved.id })
  } catch (error) {
    console.error('Erro no webhook Evolution:', error)
    res.status(500).json({ error: 'Erro ao receber webhook Evolution' })
  }
})

router.get('/api/webhooks/whatsapp/official/:tenantId', async (req, res) => {
  try {
    const mode = String(req.query['hub.mode'] || '')
    const token = String(req.query['hub.verify_token'] || '')
    const challenge = String(req.query['hub.challenge'] || '')
    if (!mode && !token && !challenge) {
      const channel = await prisma.whatsAppChannel.findUnique({ where: { tenantId_provider: { tenantId: req.params.tenantId, provider: 'official' } }, select: { active: true } })
      return res.json({ ok: true, provider: 'official', channelConfigured: Boolean(channel), verifyTokenConfigured: Boolean(verifyToken()) })
    }
    if (mode === 'subscribe' && verifyToken() && constantTimeEqual(token, verifyToken())) return res.status(200).send(challenge)
    return res.sendStatus(403)
  } catch (error) {
    console.error('Erro ao validar webhook oficial:', error)
    res.status(500).json({ error: 'Erro ao validar webhook oficial' })
  }
})

router.post('/api/webhooks/whatsapp/official/:tenantId', async (req, res) => {
  try {
    const channel = await prisma.whatsAppChannel.findUnique({
      where: { tenantId_provider: { tenantId: req.params.tenantId, provider: 'official' } },
      select: { tenantId: true, active: true, appSecretEncrypted: true },
    })
    if (!channel?.active || !channel.appSecretEncrypted) return res.status(404).json({ error: 'Canal oficial não configurado' })
    const signature = String(req.get('x-hub-signature-256') || '')
    const expected = `sha256=${crypto.createHmac('sha256', decryptCredential(channel.appSecretEncrypted)).update(req.rawBody || Buffer.from(JSON.stringify(req.body))).digest('hex')}`
    if (!constantTimeEqual(signature, expected)) return res.status(401).json({ error: 'Assinatura Meta inválida' })
    const event = officialEventInfo(req.body)
    const saved = await prisma.whatsAppWebhookEvent.create({
      data: { tenantId: channel.tenantId, provider: 'official', eventType: event.eventType, externalId: event.externalId, payload: req.body },
      select: { id: true },
    })
    res.status(200).json({ received: true, eventId: saved.id })
  } catch (error) {
    console.error('Erro no webhook oficial:', error)
    res.status(500).json({ error: 'Erro ao receber webhook oficial' })
  }
})

export default router
