// Rota de login de usuário
import express from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Dados obrigatórios faltando' });
        }

        // busca usuário no tenant correto
        const user = await prisma.user.findFirst({
            where: { email },
        });

        if (!user) {
            return res.status(400).json({ error: 'Usuário não encontrado' });
        }

        // verifica se usuário está ativo
        if (!user || user.active !== true) {
            return res.status(400).json({ error: 'Usuário não está ativo' });
        }

        // compara senha
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'Senha incorreta' });
        }

        // remove senha da resposta
        const { password: _, ...userWithoutPassword } = user;

        // gera token JWT
        const token = jwt.sign(
            { userId: user.id, tenantId: user.tenantId },
            process.env.JWT_SECRET,
            { expiresIn: '100d' }
        );

        // ✅ LOGIN BEM-SUCEDIDO
        console.log(`Usuário logado com sucesso: ${user.email} (ID: ${user.id}) token: ${token}`);

        return res.status(200).json({ ...userWithoutPassword, token });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

export default router;