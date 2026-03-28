// rota de perfil de usuário
import express from 'express';
import { PrismaClient } from '@prisma/client';
import authMiddleware from '../middlewares/auth.js';

const prisma = new PrismaClient();
const router = express.Router();

// Rota de perfil de usuário
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        // userId veio do middleware authMiddleware, então é seguro usar ele
        const user = await prisma.user.findUnique({
            where: { id: req.userId, tenantId: req.tenantId },
        });

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        // remove senha
        const { password, ...userWithoutPassword } = user;

        return res.status(200).json(userWithoutPassword);
    
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

export default router;
