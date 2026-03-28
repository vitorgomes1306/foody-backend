// Rota de acesso de usuário
import express from 'express'; // para criar rotas
import bcrypt from 'bcrypt'; // para comparação de senhas
import { PrismaClient } from '@prisma/client'; // para acesso ao banco de dados
import jwt from 'jsonwebtoken'; //importa o jwt para gerar tokens

// configuração do PrismaClient e do express.Router
const prisma = new PrismaClient();
const router = express.Router();

// Rota de login de usuário com bcrypt e JWT
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // validação básica
    if (!email || !password) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando' });
    }

    // verifica se existe
    const userExists = await prisma.user.findUnique({
      where: { email },
    });

    if (!userExists) {
      return res.status(400).json({ error: 'Usuário não encontrado' });
    }

    // compara senha
    const passwordMatch = await bcrypt.compare(password, userExists.password);

    if (!passwordMatch) {
      return res.status(400).json({ error: 'Senha incorreta' });
    }

    // retorna usuário sem senha
    const { password: _, ...userWithoutPassword } = userExists;

    // gera token
    const token = jwt.sign({ userId: userExists.id }, process.env.JWT_SECRET, { expiresIn: '100d' });

    // retorna token e usuário sem senha
    return res.status(200).json({ ...userWithoutPassword, token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
