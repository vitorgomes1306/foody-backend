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

    const tenant = await prisma.tenant.findFirst({
      where: { slug: normalizedSlug, active: true },
      include: {
        media: true,
        openingHours: { orderBy: [{ weekday: 'asc' }] },
        paymentMethods: { where: { enabled: true }, orderBy: [{ type: 'asc' }] },
        categories: {
          where: { active: true },
          include: {
            products: {
              where: { active: true },
              include: {
                optionGroups: {
                  include: {
                    options: true,
                  },
                  orderBy: [{ id: 'asc' }],
                },
              },
              orderBy: [{ seq: 'asc' }, { id: 'asc' }],
            },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    return res.status(200).json(tenant);
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

// rota para obter todos os tenants (food trucks) do usuário autenticado
router.get('/tenants', authMiddleware, async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { ownerId: req.userId },
      include: { media: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(tenants);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// rota para obter o tenant (food truck) do usuário autenticado
router.get('/tenant/me', authMiddleware, async (req, res) => {
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { ownerId: req.userId },
      include: { media: true },
      orderBy: { createdAt: 'desc' },
    });

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

    const tenant = await prisma.tenant.findFirst({
      where: { id, ownerId: req.userId },
      include: { media: true },
    });

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
    const { name, slug, phone, userId, logoUrl } = req.body;
    const parsedUserId = Number(userId);
    const normalizedLogoUrl = typeof logoUrl === 'string' ? logoUrl.trim() : undefined;
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

    const createdTenant = await prisma.tenant.create({
      data: {
        name,
        slug: resolvedSlug,
        logoUrl: typeof normalizedLogoUrl === 'string' ? (normalizedLogoUrl ? normalizedLogoUrl : null) : undefined,
        phone,
        ownerId: parsedUserId,
        active: true,
      },
    });

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
    const { name, slug, phone, active, logoUrl } = req.body;
    const parsedActive = active === 'true' ? true : active === 'false' ? false : undefined;
    const normalizedLogoUrl = typeof logoUrl === 'string' ? logoUrl.trim() : undefined;

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

    const updatedTenant = await prisma.tenant.update({
      where: { id },
      data: {
        name,
        slug,
        logoUrl: typeof normalizedLogoUrl === 'string' ? (normalizedLogoUrl ? normalizedLogoUrl : null) : undefined,
        phone,
        active: typeof parsedActive === 'boolean' ? parsedActive : tenantExists.active,
      },
    });

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
