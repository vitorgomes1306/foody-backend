import express from 'express'
import { PrismaClient } from '@prisma/client'
import authMiddleware from '../middlewares/auth.js'
import { firebaseMessagingStatus, getFirebaseMessaging } from '../utils/firebaseMessaging.js'

const prisma = new PrismaClient()
const router = express.Router()
const AUDIENCES = new Set(['all', 'lite', 'basic', 'master'])

async function requireAdmin(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } })
  if (!user?.isAdmin) return res.status(403).json({ error: 'Acesso exclusivo para administradores' })
  next()
}

function noticeData(body, { partial = false } = {}) {
  const data = {}
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'title')) {
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    if (!title || title.length > 100) throw new Error('Informe um título de até 100 caracteres')
    data.title = title
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'message')) {
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    if (!message || message.length > 1200) throw new Error('Informe uma mensagem de até 1200 caracteres')
    data.message = message
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'audience')) {
    if (!AUDIENCES.has(body?.audience)) throw new Error('Público inválido')
    data.audience = body.audience
  }
  if (Object.prototype.hasOwnProperty.call(body, 'show')) data.show = body.show === true
  for (const field of ['startsAt', 'endsAt']) {
    if (!partial || Object.prototype.hasOwnProperty.call(body, field)) {
      if (!body?.[field]) data[field] = null
      else {
        const date = new Date(body[field])
        if (Number.isNaN(date.getTime())) throw new Error(`${field} inválido`)
        data[field] = date
      }
    }
  }
  if (data.startsAt && data.endsAt && data.startsAt >= data.endsAt) throw new Error('A data final deve ser posterior à inicial')
  return data
}

router.post('/notifications/device-token', authMiddleware, async (req, res) => {
  if (req.authRole === 'waiter') return res.status(403).json({ error: 'Notificações não estão disponíveis para garçons' })
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  if (!token || token.length < 20 || token.length > 4096) return res.status(400).json({ error: 'Token de notificação inválido' })
  const platform = ['android', 'ios'].includes(req.body?.platform) ? req.body.platform : 'android'
  const row = await prisma.pushDeviceToken.upsert({
    where: { token },
    create: { token, userId: req.userId, platform },
    update: { userId: req.userId, platform, active: true, lastSeenAt: new Date() },
  })
  return res.status(201).json({ id: row.id, registered: true })
})

router.delete('/notifications/device-token', authMiddleware, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  if (token) await prisma.pushDeviceToken.updateMany({ where: { token, userId: req.userId }, data: { active: false } })
  return res.status(204).send()
})

router.get('/notices/active', authMiddleware, async (req, res) => {
  if (req.authRole === 'waiter') return res.json([])
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { plan: true, isAdmin: true } })
  if (!user || user.isAdmin) return res.json([])
  const now = new Date()
  const rows = await prisma.appNotice.findMany({
    where: {
      show: true,
      audience: { in: ['all', user.plan] },
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  })
  return res.json(rows)
})

router.get('/notifications/admin/notices', authMiddleware, requireAdmin, async (_req, res) => {
  const notices = await prisma.appNotice.findMany({ orderBy: { updatedAt: 'desc' } })
  return res.json({ notices, firebase: firebaseMessagingStatus() })
})

router.post('/notifications/admin/notices', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const notice = await prisma.appNotice.create({ data: { ...noticeData(req.body), show: req.body?.show === true } })
    return res.status(201).json(notice)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

router.patch('/notifications/admin/notices/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const data = noticeData(req.body, { partial: true })
    const result = await prisma.appNotice.updateMany({ where: { id: req.params.id }, data })
    if (!result.count) return res.status(404).json({ error: 'Aviso não encontrado' })
    return res.json(await prisma.appNotice.findUnique({ where: { id: req.params.id } }))
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

router.delete('/notifications/admin/notices/:id', authMiddleware, requireAdmin, async (req, res) => {
  const result = await prisma.appNotice.deleteMany({ where: { id: req.params.id } })
  if (!result.count) return res.status(404).json({ error: 'Aviso não encontrado' })
  return res.status(204).send()
})

router.post('/notifications/admin/notices/:id/send', authMiddleware, requireAdmin, async (req, res) => {
  const notice = await prisma.appNotice.findUnique({ where: { id: req.params.id } })
  if (!notice) return res.status(404).json({ error: 'Aviso não encontrado' })
  const messaging = getFirebaseMessaging()
  if (!messaging) return res.status(503).json({ error: firebaseMessagingStatus().error })
  const devices = await prisma.pushDeviceToken.findMany({
    where: { active: true, user: { isAdmin: false, ...(notice.audience === 'all' ? {} : { plan: notice.audience }) } },
    select: { token: true },
  })
  let successCount = 0
  let failureCount = 0
  const invalidTokens = []
  for (let index = 0; index < devices.length; index += 500) {
    const tokens = devices.slice(index, index + 500).map((device) => device.token)
    if (!tokens.length) continue
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: notice.title, body: notice.message },
      data: { noticeId: notice.id, route: '/dash' },
      android: { priority: 'high', notification: { channelId: 'chefito_avisos', sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    })
    successCount += response.successCount
    failureCount += response.failureCount
    response.responses.forEach((item, responseIndex) => {
      if (!item.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(item.error?.code)) invalidTokens.push(tokens[responseIndex])
    })
  }
  if (invalidTokens.length) await prisma.pushDeviceToken.updateMany({ where: { token: { in: invalidTokens } }, data: { active: false } })
  await prisma.appNotice.update({ where: { id: notice.id }, data: { lastPushAt: new Date(), lastPushCount: successCount } })
  return res.json({ successCount, failureCount, devices: devices.length })
})

export default router
