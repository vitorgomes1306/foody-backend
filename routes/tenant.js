import express from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import authMiddleware from '../middlewares/auth.js';

const prisma = new PrismaClient();
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function toSafePathSegment(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const sanitized = normalized.replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized || 'tenant';
}

function extensionFromMimeType(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/webm') return 'webm';
  if (mimeType === 'video/quicktime') return 'mov';
  return null;
}

async function uploadFileToSupabase({ supabase, bucket, path, file, upsert }) {
  const { error } = await supabase.storage.from(bucket).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: Boolean(upsert),
  });

  if (error) {
    throw new Error(error.message || 'Falha ao enviar arquivo para o Supabase Storage');
  }

  const publicUrlResult = supabase.storage.from(bucket).getPublicUrl(path);
  const publicUrl = publicUrlResult?.data?.publicUrl;
  if (!publicUrl) {
    throw new Error('Falha ao gerar URL pública do arquivo enviado');
  }

  return { publicUrl, path };
}

function isTimeString(value) {
  if (typeof value !== 'string') return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

function normalizeTimeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isTimeString(trimmed) ? trimmed : null;
}

function parsePriceToDecimalString(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(2);
}

function isMissingTenantColumn(err, columnName) {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? err.code : null;
  const msg = 'message' in err && typeof err.message === 'string' ? err.message : '';
  const metaColumn =
    'meta' in err && err.meta && typeof err.meta === 'object' && 'column' in err.meta && typeof err.meta.column === 'string'
      ? err.meta.column
      : '';

  const needle = String(columnName || '').trim();
  if (!needle) return false;

  if (code === 'P2022' && (metaColumn === `Tenant.${needle}` || metaColumn.includes(needle) || msg.includes(needle))) return true;
  if (msg.includes(needle) && msg.toLowerCase().includes('does not exist')) return true;
  return false;
}

function tenantSelect({ includeDeliveryFee, includePublicRelations }) {
  const base = {
    id: true,
    name: true,
    slug: true,
    logoUrl: true,
    phone: true,
    ...(includeDeliveryFee ? { deliveryFee: true } : {}),
    ownerId: true,
    active: true,
    createdAt: true,
    updatedAt: true,
    zipCode: true,
    street: true,
    number: true,
    complement: true,
    district: true,
    city: true,
    state: true,
    country: true,
    email: true,
    website: true,
    instagram: true,
    facebook: true,
    twitter: true,
    youtube: true,
    geoLocation: true,
    media: true,
  };

  if (!includePublicRelations) return base;

  return {
    ...base,
    openingHours: {
      orderBy: [{ weekday: 'asc' }],
      select: {
        id: true,
        tenantId: true,
        weekday: true,
        closed: true,
        openTime: true,
        closeTime: true,
      },
    },
    paymentMethods: {
      where: { enabled: true },
      orderBy: [{ type: 'asc' }],
      select: {
        id: true,
        tenantId: true,
        type: true,
        enabled: true,
        label: true,
        details: true,
        createdAt: true,
        updatedAt: true,
      },
    },
    categories: {
      where: { active: true },
      select: {
        id: true,
        tenantId: true,
        name: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        products: {
          where: { active: true },
          select: {
            id: true,
            tenantId: true,
            categoryId: true,
            seq: true,
            name: true,
            description: true,
            price: true,
            imageUrl: true,
            active: true,
            createdAt: true,
            updatedAt: true,
            optionGroups: {
              orderBy: [{ id: 'asc' }],
              select: {
                id: true,
                productId: true,
                name: true,
                required: true,
                multiple: true,
                min: true,
                max: true,
                createdAt: true,
                updatedAt: true,
                options: true,
              },
            },
          },
          orderBy: [{ seq: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    },
  };
}

async function assertTenantOwner({ tenantId, userId }) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, ownerId: userId },
    select: { id: true },
  });
  return Boolean(tenant);
}

// rota pública para obter tenant pelo slug (para cardápio / vitrine)
router.get('/public/tenant/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const normalizedSlug = typeof slug === 'string' ? slug.trim().toLowerCase() : '';
    if (!normalizedSlug) {
      return res.status(400).json({ error: 'Slug inválido' });
    }

    let baseTenant;
    try {
      baseTenant = await prisma.tenant.findFirst({
        where: { slug: normalizedSlug, active: true },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          phone: true,
          deliveryFee: true,
        },
      });
    } catch (err) {
      if (!isMissingTenantColumn(err, 'deliveryFee')) throw err;
      baseTenant = await prisma.tenant.findFirst({
        where: { slug: normalizedSlug, active: true },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          phone: true,
        },
      });
    }

    if (!baseTenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    const tenantId = baseTenant.id;

    const [media, openingHours, paymentMethods, categories] = await Promise.all([
      prisma.tenantMedia.findMany({ where: { tenantId }, orderBy: [{ id: 'asc' }] }).catch(() => []),
      prisma.tenantOpeningHour.findMany({ where: { tenantId }, orderBy: [{ weekday: 'asc' }] }).catch(() => []),
      prisma.tenantPaymentMethod
        .findMany({ where: { tenantId, enabled: true }, orderBy: [{ type: 'asc' }] })
        .catch(() => []),
      prisma.category
        .findMany({
          where: { tenantId, active: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          include: {
            products: {
              where: { active: true },
              orderBy: [{ seq: 'asc' }, { id: 'asc' }],
              include: {
                optionGroups: {
                  orderBy: [{ id: 'asc' }],
                  include: { options: true },
                },
              },
            },
          },
        })
        .catch(() => []),
    ]);

    return res.status(200).json({
      ...baseTenant,
      deliveryFee: typeof baseTenant.deliveryFee === 'undefined' ? '0.00' : baseTenant.deliveryFee,
      media,
      openingHours,
      paymentMethods,
      categories,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/tenant/:id/opening-hours', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId });
    if (!allowed) return res.status(403).json({ error: 'Acesso negado ao tenant' });

    const openingHours = await prisma.tenantOpeningHour.findMany({
      where: { tenantId },
      orderBy: [{ weekday: 'asc' }],
    });

    return res.status(200).json(openingHours);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/tenant/:id/opening-hours', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId });
    if (!allowed) return res.status(403).json({ error: 'Acesso negado ao tenant' });

    const hours = Array.isArray(req.body?.hours) ? req.body.hours : Array.isArray(req.body) ? req.body : null;
    if (!hours) return res.status(400).json({ error: 'Body inválido: envie um array ou { hours: [...] }' });

    const allowedWeekdays = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    const normalized = [];
    const seen = new Set();

    for (const item of hours) {
      const weekday = typeof item?.weekday === 'string' ? item.weekday.trim().toLowerCase() : '';
      if (!allowedWeekdays.has(weekday)) return res.status(400).json({ error: 'weekday inválido' });
      if (seen.has(weekday)) return res.status(400).json({ error: `weekday duplicado: ${weekday}` });
      seen.add(weekday);

      const closed = typeof item?.closed === 'boolean' ? item.closed : false;
      const openTime = normalizeTimeString(item?.openTime);
      const closeTime = normalizeTimeString(item?.closeTime);

      if (!closed) {
        if (!openTime || !closeTime) return res.status(400).json({ error: 'openTime/closeTime obrigatórios quando closed=false' });
        if (openTime >= closeTime) return res.status(400).json({ error: 'openTime deve ser menor que closeTime' });
      }

      normalized.push({
        tenantId,
        weekday,
        closed,
        openTime: closed ? null : openTime,
        closeTime: closed ? null : closeTime,
      });
    }

    const saved = await prisma.$transaction(async (tx) => {
      await tx.tenantOpeningHour.deleteMany({ where: { tenantId } });
      if (normalized.length) {
        await tx.tenantOpeningHour.createMany({ data: normalized });
      }
      return await tx.tenantOpeningHour.findMany({
        where: { tenantId },
        orderBy: [{ weekday: 'asc' }],
      });
    });

    return res.status(200).json(saved);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/tenant/:id/payment-methods', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId });
    if (!allowed) return res.status(403).json({ error: 'Acesso negado ao tenant' });

    const paymentMethods = await prisma.tenantPaymentMethod.findMany({
      where: { tenantId },
      orderBy: [{ type: 'asc' }],
    });

    return res.status(200).json(paymentMethods);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/tenant/:id/payment-methods/:type', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const type = typeof req.params.type === 'string' ? req.params.type.trim().toLowerCase() : '';
    const allowedTypes = new Set(['cash', 'pix', 'debit_card', 'credit_card', 'voucher', 'other']);
    if (!allowedTypes.has(type)) return res.status(400).json({ error: 'type inválido' });

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId });
    if (!allowed) return res.status(403).json({ error: 'Acesso negado ao tenant' });

    const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : true;
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : null;
    const details = typeof req.body?.details === 'object' && req.body.details !== null ? req.body.details : null;

    const paymentMethod = await prisma.tenantPaymentMethod.upsert({
      where: { tenantId_type: { tenantId, type } },
      update: { enabled, label, details },
      create: { tenantId, type, enabled, label, details },
    });

    return res.status(200).json(paymentMethod);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.delete('/tenant/:id/payment-methods/:type', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const type = typeof req.params.type === 'string' ? req.params.type.trim().toLowerCase() : '';
    const allowedTypes = new Set(['cash', 'pix', 'debit_card', 'credit_card', 'voucher', 'other']);
    if (!allowedTypes.has(type)) return res.status(400).json({ error: 'type inválido' });

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId });
    if (!allowed) return res.status(403).json({ error: 'Acesso negado ao tenant' });

    await prisma.tenantPaymentMethod.delete({
      where: { tenantId_type: { tenantId, type } },
    });

    return res.status(204).json({});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/tenant/:id/delivery-men', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.id;
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId });
    if (!allowed) return res.status(403).json({ error: 'Acesso negado ao tenant' });

    const list = await prisma.deliveryMen.findMany({
      where: { tenantId },
      orderBy: [{ id: 'desc' }],
    });

    return res.status(200).json(list);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/tenant/:id/delivery-men', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const tenantId = req.params.id;
    const allowed = await assertTenantOwner({ tenantId, userId: req.userId });
    if (!allowed) return res.status(403).json({ error: 'Acesso negado ao tenant' });

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    const plateVehicle = typeof req.body?.plateVehicle === 'string' ? req.body.plateVehicle.trim() : '';
    const modelvehicle = typeof req.body?.modelvehicle === 'string' ? req.body.modelvehicle.trim() : '';

    if (!name || !phone || !address || !plateVehicle || !modelvehicle) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, phone, address, plateVehicle, modelvehicle' });
    }

    const avatarFile = req.file;
    const supabase = getSupabaseClient();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'tenants';
    if (avatarFile && !supabase) {
      return res.status(500).json({ error: 'Supabase não configurado para upload (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' });
    }

    const created = await prisma.deliveryMen.create({
      data: {
        tenantId,
        name,
        phone,
        email: email || null,
        address,
        plateVehicle,
        modelvehicle,
      },
    });

    if (avatarFile) {
      if (!avatarFile.mimetype?.startsWith('image/')) {
        return res.status(400).json({ error: 'O avatar deve ser uma imagem' });
      }
      const ext = extensionFromMimeType(avatarFile.mimetype) || 'bin';
      const avatarPath = `${tenantId}/delivery-men/${created.id}/avatar-${uuidv4()}.${ext}`;
      const uploadedAvatar = await uploadFileToSupabase({
        supabase,
        bucket,
        path: avatarPath,
        file: avatarFile,
        upsert: false,
      });
      const updated = await prisma.deliveryMen.update({
        where: { id: created.id },
        data: { avatar: uploadedAvatar.publicUrl },
      });
      return res.status(201).json(updated);
    }

    return res.status(201).json(created);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/tenant/:tenantId/delivery-men/:id', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId });
    if (!allowed) return res.status(403).json({ error: 'Acesso negado ao tenant' });

    const existing = await prisma.deliveryMen.findFirst({ where: { id, tenantId } });
    if (!existing) return res.status(404).json({ error: 'Entregador não encontrado' });

    const data = {};
    if (typeof req.body?.name === 'string') data.name = req.body.name.trim();
    if (typeof req.body?.phone === 'string') data.phone = req.body.phone.trim();
    if (typeof req.body?.email === 'string') data.email = req.body.email.trim() || null;
    if (typeof req.body?.address === 'string') data.address = req.body.address.trim();
    if (typeof req.body?.plateVehicle === 'string') data.plateVehicle = req.body.plateVehicle.trim();
    if (typeof req.body?.modelvehicle === 'string') data.modelvehicle = req.body.modelvehicle.trim();

    const avatarFile = req.file;
    const supabase = getSupabaseClient();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'tenants';
    if (avatarFile && !supabase) {
      return res.status(500).json({ error: 'Supabase não configurado para upload (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' });
    }

    let avatarUrl = null;
    if (avatarFile) {
      if (!avatarFile.mimetype?.startsWith('image/')) {
        return res.status(400).json({ error: 'O avatar deve ser uma imagem' });
      }
      const ext = extensionFromMimeType(avatarFile.mimetype) || 'bin';
      const avatarPath = `${tenantId}/delivery-men/${id}/avatar-${uuidv4()}.${ext}`;
      const uploadedAvatar = await uploadFileToSupabase({
        supabase,
        bucket,
        path: avatarPath,
        file: avatarFile,
        upsert: false,
      });
      avatarUrl = uploadedAvatar.publicUrl;
      data.avatar = avatarUrl;
    }

    const updated = await prisma.deliveryMen.update({
      where: { id },
      data,
    });

    return res.status(200).json(updated);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.delete('/tenant/:tenantId/delivery-men/:id', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId });
    if (!allowed) return res.status(403).json({ error: 'Acesso negado ao tenant' });

    const existing = await prisma.deliveryMen.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'Entregador não encontrado' });

    await prisma.deliveryMen.delete({ where: { id } });
    return res.status(204).json({});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/tenant/:tenantId/delivery-men/:id/stats', authMiddleware, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });

    const allowed = await assertTenantOwner({ tenantId, userId: req.userId });
    if (!allowed) return res.status(403).json({ error: 'Acesso negado ao tenant' });

    const existing = await prisma.deliveryMen.findFirst({ where: { id, tenantId }, select: { id: true, name: true } });
    if (!existing) return res.status(404).json({ error: 'Entregador não encontrado' });

    const fromRaw = typeof req.query?.from === 'string' ? req.query.from.trim() : '';
    const toRaw = typeof req.query?.to === 'string' ? req.query.to.trim() : '';

    const parseDateOnly = (value) => {
      if (!value) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const d = new Date(`${value}T00:00:00.000Z`);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const fromDate = parseDateOnly(fromRaw);
    const toDate = parseDateOnly(toRaw);

    const toEndOfDay = (d) => new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);

    const dateFilter =
      fromDate || toDate
        ? {
            statusChangedAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toEndOfDay(toDate) } : {}),
            },
          }
        : {};

    const baseWhere = { tenantId, deliveryManId: id, status: 'delivered', ...dateFilter };

    const deliveredCount = await prisma.order.count({ where: baseWhere });

    let deliveredTotals;
    try {
      deliveredTotals = await prisma.order.aggregate({
        where: baseWhere,
        _sum: { total: true, deliveryFee: true },
      });
    } catch {
      deliveredTotals = { _sum: { total: null, deliveryFee: null } };
    }

    let lastOrders;
    try {
      lastOrders = await prisma.order.findMany({
        where: baseWhere,
        orderBy: [{ statusChangedAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true,
          total: true,
          deliveryFee: true,
          createdAt: true,
          statusChangedAt: true,
          customerName: true,
          type: true,
        },
      });
    } catch (err) {
      lastOrders = await prisma.order.findMany({
        where: { tenantId, deliveryManId: id, status: 'delivered' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true,
          total: true,
          createdAt: true,
          customerName: true,
          type: true,
        },
      });
    }

    return res.status(200).json({
      deliveredCount,
      deliveredTotalSum: deliveredTotals?._sum?.total ?? null,
      deliveredDeliveryFeeSum: deliveredTotals?._sum?.deliveryFee ?? null,
      lastOrders,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// rota para obter todos os tenants (food trucks) do usuário autenticado
router.get('/tenants', authMiddleware, async (req, res) => {
  try {
    let tenants;
    try {
      tenants = await prisma.tenant.findMany({
        where: { ownerId: req.userId },
        orderBy: { createdAt: 'desc' },
        select: tenantSelect({ includeDeliveryFee: true, includePublicRelations: false }),
      });
    } catch (err) {
      if (!isMissingTenantColumn(err, 'deliveryFee')) throw err;
      tenants = await prisma.tenant.findMany({
        where: { ownerId: req.userId },
        orderBy: { createdAt: 'desc' },
        select: tenantSelect({ includeDeliveryFee: false, includePublicRelations: false }),
      });
    }

    return res.status(200).json(tenants);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// rota para obter o tenant (food truck) do usuário autenticado
router.get('/tenant/me', authMiddleware, async (req, res) => {
  try {
    let tenant;
    try {
      tenant = await prisma.tenant.findFirst({
        where: { ownerId: req.userId },
        orderBy: { createdAt: 'desc' },
        select: tenantSelect({ includeDeliveryFee: true, includePublicRelations: false }),
      });
    } catch (err) {
      if (!isMissingTenantColumn(err, 'deliveryFee')) throw err;
      tenant = await prisma.tenant.findFirst({
        where: { ownerId: req.userId },
        orderBy: { createdAt: 'desc' },
        select: tenantSelect({ includeDeliveryFee: false, includePublicRelations: false }),
      });
    }

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    return res.status(200).json(tenant);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// rota para obter um tenant (food truck) pelo ID
router.get('/tenant/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    let tenant;
    try {
      tenant = await prisma.tenant.findFirst({
        where: { id, ownerId: req.userId },
        select: tenantSelect({ includeDeliveryFee: true, includePublicRelations: false }),
      });
    } catch (err) {
      if (!isMissingTenantColumn(err, 'deliveryFee')) throw err;
      tenant = await prisma.tenant.findFirst({
        where: { id, ownerId: req.userId },
        select: tenantSelect({ includeDeliveryFee: false, includePublicRelations: false }),
      });
    }

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    return res.status(200).json(tenant);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// rota para criar um tenant (food truck) com dados básicos
router.post(
  '/tenant',
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'media', maxCount: 20 },
  ]),
  async (req, res) => {
  try {
    const { name, slug, phone, userId, logoUrl, deliveryFee } = req.body;
    const parsedUserId = Number(userId);
    const normalizedLogoUrl = typeof logoUrl === 'string' ? logoUrl.trim() : undefined;
    const parsedDeliveryFee = typeof deliveryFee === 'undefined' ? null : parsePriceToDecimalString(deliveryFee);
    if (typeof deliveryFee !== 'undefined' && parsedDeliveryFee === null) return res.status(400).json({ error: 'deliveryFee inválido' });
    const rawSlug = typeof slug === 'string' ? slug.trim() : '';
    const baseSlug = toSafePathSegment(rawSlug || name);
    const slugWasProvided = Boolean(rawSlug);

    // validação básica
    if (!name || !Number.isFinite(parsedUserId)) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando' });
    }

    let resolvedSlug = baseSlug;
    if (slugWasProvided) {
      const slugExists = await prisma.tenant.findUnique({
        where: { slug: resolvedSlug },
      });
      if (slugExists) {
        return res.status(400).json({ error: 'Já existe um food truck com esse slug' });
      }
    } else {
      for (let i = 0; i < 50; i += 1) {
        const slugExists = await prisma.tenant.findUnique({
          where: { slug: resolvedSlug },
        });
        if (!slugExists) break;
        resolvedSlug = `${baseSlug}-${i + 2}`;
      }

      const slugExists = await prisma.tenant.findUnique({
        where: { slug: resolvedSlug },
      });
      if (slugExists) {
        return res.status(500).json({ error: 'Falha ao gerar slug único' });
      }
    }

    // verifica se o usuário existe
    const userExists = await prisma.user.findUnique({
      where: { id: parsedUserId },
    });

    if (!userExists) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const supabase = getSupabaseClient();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'tenants';
    const hasAnyFiles = Boolean(req.files?.logo?.length || req.files?.media?.length);
    if (hasAnyFiles && !supabase) {
      return res.status(500).json({ error: 'Supabase não configurado para upload (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' });
    }

    let createdTenant;
    try {
      createdTenant = await prisma.tenant.create({
        data: {
          name,
          slug: resolvedSlug,
          logoUrl: typeof normalizedLogoUrl === 'string' ? (normalizedLogoUrl ? normalizedLogoUrl : null) : undefined,
          phone,
          deliveryFee: parsedDeliveryFee ?? '0.00',
          ownerId: parsedUserId,
          active: true,
        },
      });
    } catch (err) {
      if (!isMissingTenantColumn(err, 'deliveryFee')) throw err;
      createdTenant = await prisma.tenant.create({
        data: {
          name,
          slug: resolvedSlug,
          logoUrl: typeof normalizedLogoUrl === 'string' ? (normalizedLogoUrl ? normalizedLogoUrl : null) : undefined,
          phone,
          ownerId: parsedUserId,
          active: true,
        },
      });
    }

    const safeSlug = toSafePathSegment(resolvedSlug);
    const uploadedPaths = [];

    try {
      const logoFile = req.files?.logo?.[0];
      if (logoFile) {
        if (!logoFile.mimetype?.startsWith('image/')) {
          return res.status(400).json({ error: 'O logo deve ser uma imagem' });
        }

        const ext = extensionFromMimeType(logoFile.mimetype) || 'bin';
        const logoPath = `${safeSlug}/${createdTenant.id}/logo.${ext}`;
        const uploadedLogo = await uploadFileToSupabase({
          supabase,
          bucket,
          path: logoPath,
          file: logoFile,
          upsert: true,
        });
        uploadedPaths.push(uploadedLogo.path);

        await prisma.tenant.update({
          where: { id: createdTenant.id },
          data: { logoUrl: uploadedLogo.publicUrl },
        });
      }

      const mediaFiles = req.files?.media ?? [];
      if (mediaFiles.length) {
        const mediaToCreate = [];

        for (const file of mediaFiles) {
          const isImage = file.mimetype?.startsWith('image/');
          const isVideo = file.mimetype?.startsWith('video/');
          if (!isImage && !isVideo) {
            return res.status(400).json({ error: 'Envie apenas imagens ou vídeos no campo media' });
          }

          const ext = extensionFromMimeType(file.mimetype) || 'bin';
          const mediaPath = `${safeSlug}/${createdTenant.id}/media/${uuidv4()}.${ext}`;
          const uploadedMedia = await uploadFileToSupabase({
            supabase,
            bucket,
            path: mediaPath,
            file,
            upsert: false,
          });
          uploadedPaths.push(uploadedMedia.path);

          mediaToCreate.push({
            tenantId: createdTenant.id,
            kind: isImage ? 'image' : 'video',
            url: uploadedMedia.publicUrl,
            mimeType: file.mimetype,
          });
        }

        if (mediaToCreate.length) {
          await prisma.tenantMedia.createMany({ data: mediaToCreate });
        }
      }

      const tenantWithMedia = await prisma.tenant.findUnique({
        where: { id: createdTenant.id },
        include: { media: true },
      });

      return res.status(201).json(tenantWithMedia);
    } catch (uploadError) {
      if (supabase && uploadedPaths.length) {
        try {
          await supabase.storage.from(bucket).remove(uploadedPaths);
        } catch {
          void 0;
        }
      }

      await prisma.tenant.delete({ where: { id: createdTenant.id } });
      throw uploadError;
    }

  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Já existe um food truck com esse slug' });
    }
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  }
);

// rota para PUT atualizar dados básicos de um tenant (food truck)
router.put(
  '/tenant/:id',
  authMiddleware,
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'media', maxCount: 20 },
  ]),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, phone, active, logoUrl, deliveryFee } = req.body;
    const parsedActive = active === 'true' ? true : active === 'false' ? false : undefined;
    const normalizedLogoUrl = typeof logoUrl === 'string' ? logoUrl.trim() : undefined;
    const parsedDeliveryFee = typeof deliveryFee === 'undefined' ? null : parsePriceToDecimalString(deliveryFee);
    if (typeof deliveryFee !== 'undefined' && parsedDeliveryFee === null) return res.status(400).json({ error: 'deliveryFee inválido' });

    // validação básica
    if (!name || !slug) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando' });
    }

    // verifica se o tenant existe
    const tenantExists = await prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenantExists) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    if (tenantExists.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado ao tenant' });
    }

    // verifica se o slug já está em uso por outro tenant
    if (slug !== tenantExists.slug) {
      const slugExists = await prisma.tenant.findUnique({
        where: { slug },
      });
      if (slugExists) {
        return res.status(400).json({ error: 'Já existe um food truck com esse slug' });
      }
    }

    const supabase = getSupabaseClient();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'tenants';
    const hasAnyFiles = Boolean(req.files?.logo?.length || req.files?.media?.length);
    if (hasAnyFiles && !supabase) {
      return res.status(500).json({ error: 'Supabase não configurado para upload (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' });
    }

    const safeSlug = toSafePathSegment(slug);
    const uploadedPaths = [];

    let updatedTenant;
    try {
      updatedTenant = await prisma.tenant.update({
        where: { id },
        data: {
          name,
          slug,
          logoUrl: typeof normalizedLogoUrl === 'string' ? (normalizedLogoUrl ? normalizedLogoUrl : null) : undefined,
          phone,
          active: typeof parsedActive === 'boolean' ? parsedActive : tenantExists.active,
          ...(parsedDeliveryFee !== null ? { deliveryFee: parsedDeliveryFee } : {}),
        },
      });
    } catch (err) {
      if (!isMissingTenantColumn(err, 'deliveryFee')) throw err;
      updatedTenant = await prisma.tenant.update({
        where: { id },
        data: {
          name,
          slug,
          logoUrl: typeof normalizedLogoUrl === 'string' ? (normalizedLogoUrl ? normalizedLogoUrl : null) : undefined,
          phone,
          active: typeof parsedActive === 'boolean' ? parsedActive : tenantExists.active,
        },
      });
    }

    try {
      const logoFile = req.files?.logo?.[0];
      if (logoFile) {
        if (!logoFile.mimetype?.startsWith('image/')) {
          return res.status(400).json({ error: 'O logo deve ser uma imagem' });
        }

        const ext = extensionFromMimeType(logoFile.mimetype) || 'bin';
        const logoPath = `${safeSlug}/${updatedTenant.id}/logo.${ext}`;
        const uploadedLogo = await uploadFileToSupabase({
          supabase,
          bucket,
          path: logoPath,
          file: logoFile,
          upsert: true,
        });
        uploadedPaths.push(uploadedLogo.path);

        await prisma.tenant.update({
          where: { id: updatedTenant.id },
          data: { logoUrl: uploadedLogo.publicUrl },
        });
      }

      const mediaFiles = req.files?.media ?? [];
      if (mediaFiles.length) {
        const mediaToCreate = [];

        for (const file of mediaFiles) {
          const isImage = file.mimetype?.startsWith('image/');
          const isVideo = file.mimetype?.startsWith('video/');
          if (!isImage && !isVideo) {
            return res.status(400).json({ error: 'Envie apenas imagens ou vídeos no campo media' });
          }

          const ext = extensionFromMimeType(file.mimetype) || 'bin';
          const mediaPath = `${safeSlug}/${updatedTenant.id}/media/${uuidv4()}.${ext}`;
          const uploadedMedia = await uploadFileToSupabase({
            supabase,
            bucket,
            path: mediaPath,
            file,
            upsert: false,
          });
          uploadedPaths.push(uploadedMedia.path);

          mediaToCreate.push({
            tenantId: updatedTenant.id,
            kind: isImage ? 'image' : 'video',
            url: uploadedMedia.publicUrl,
            mimeType: file.mimetype,
          });
        }

        if (mediaToCreate.length) {
          await prisma.tenantMedia.createMany({ data: mediaToCreate });
        }
      }

      const tenantWithMedia = await prisma.tenant.findUnique({
        where: { id: updatedTenant.id },
        include: { media: true },
      });

      return res.status(200).json(tenantWithMedia);
    } catch (uploadError) {
      if (supabase && uploadedPaths.length) {
        try {
          await supabase.storage.from(bucket).remove(uploadedPaths);
        } catch {
          void 0;
        }
      }

      throw uploadError;
    }

  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Já existe um food truck com esse slug' });
    }
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
  }
);

// rota para deletar um tenant (food truck)

router.delete('/tenant/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // verifica se o tenant existe
    const tenantExists = await prisma.tenant.findUnique({
      where: { id },
    });
    if (!tenantExists) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    if (tenantExists.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado ao tenant' });
    }
    // deleta o tenant
    await prisma.tenant.delete({
      where: { id },
    });

    //Resposta de sucesso
    
    console.log({ message: `Tenant ${tenantExists.name} com ID ${tenantExists.id} deletado com sucesso}` });

    // return com resposta 
    return res.status(204).json({});
  
} catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
