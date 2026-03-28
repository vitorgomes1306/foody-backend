// Rota de registro de usuário
import express from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const router = express.Router();

// Registro de usuário com bcrypt

router.post('/users', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // validação básica
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando' });
    }

    // verifica se já existe
    const userExists = await prisma.user.findUnique({
      where: { email },
    });

    // verifica se já existe usuário com esse email
    if (userExists) {
      return res.status(400).json({ error: 'Erro ao criar cadastro' });
    }

    // hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // cria usuário
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    // remove senha da resposta
    const { password: _, ...userWithoutPassword } = user;

    return res.status(201).json(userWithoutPassword);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;



