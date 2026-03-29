import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// rota para criar um tenant (food truck) com dados básicos
router.post('/tenant', async (req, res) => {
  try {
    const { name, slug, logoUrl, phone, userId } = req.body;

    // validação básica
    if (!name || !slug || !userId) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando' });
    }

    // verifica se já existe tenant com esse slug
    const slugExists = await prisma.tenant.findUnique({
      where: { slug },
    });

    if (slugExists) {
      return res.status(400).json({ error: 'Já existe um food truck com esse slug' });
    }

    // verifica se o usuário existe
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userExists) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        logoUrl,
        phone,
        active: true,
        users: {
          connect: { id: userId },
        },
      },
    });

    return res.status(201).json(tenant);

  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Já existe um food truck com esse slug' });
    }
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// rota para PUT atualizar dados básicos de um tenant (food truck)
router.put('/tenant/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, logoUrl, phone, active } = req.body;

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

    // verifica se o slug já está em uso por outro tenant
    if (slug !== tenantExists.slug) {
      const slugExists = await prisma.tenant.findUnique({
        where: { slug },
      });
      if (slugExists) {
        return res.status(400).json({ error: 'Já existe um food truck com esse slug' });
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        name,
        slug,
        logoUrl,
        phone,
        active,
      },
    });

    return res.status(200).json(tenant);

  } catch (error) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Já existe um food truck com esse slug' });
    }
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// rota para deletar um tenant (food truck)

router.delete('/tenant/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // verifica se o tenant existe
    const tenantExists = await prisma.tenant.findUnique({
      where: { id },
    });
    if (!tenantExists) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
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