import express from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

router.post('/users', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando' });
    }

    const userExists = await prisma.user.findFirst({
      where: { email },
    });

    if (userExists) {
      return res.status(400).json({ error: 'Erro ao criar cadastro' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    
    // Bloco de cadastro bem-sucedido
    // ✅ CADASTRO BEM-SUCEDIDO
    console.log({
        message: '✅ Registro realizado com sucesso',
        name,
        email,
        timestamp: new Date().toISOString(),
    })
    
    // Aqui podemremos enviar emails de confirmação ou enviar para APIS externas como o Sendd.
    //====================================================================================
    
    return res.status(201).json(userWithoutPassword);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;