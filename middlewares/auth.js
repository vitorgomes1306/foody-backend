// importa o jwt para verificar tokens
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { getBillingAccess, serializeBillingAccess } from '../utils/billing.js';

const prisma = new PrismaClient();

// middleware para verificar tokens
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  // verifica se há token no header
  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  // extrai token do header
  const token = authHeader.split(' ')[1];

  // verifica token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // adiciona userId ao request
    req.userId = decoded.userId;
    req.tenantId = decoded.tenantId;
    req.waiterId = decoded.waiterId;
    req.authRole = decoded.role || 'user';

    if (req.authRole === 'waiter') {
      const waiterTenant = await prisma.tenant.findUnique({ where: { id: req.tenantId }, select: { settings: true } });
      if (!waiterTenant || waiterTenant.settings?.waiterAppEnabled === false) {
        return res.status(403).json({ error: 'O aplicativo do garçom não está habilitado para esta empresa', code: 'WAITER_APP_DISABLED' });
      }
    } else {
      const sessionUser = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { plan: true, liteSessionId: true },
      });
      if (!sessionUser) return res.status(401).json({ error: 'Usuário não encontrado' });
      if (sessionUser.plan === 'lite' && (!decoded.liteSessionId || decoded.liteSessionId !== sessionUser.liteSessionId)) {
        return res.status(401).json({
          error: 'Esta conta Lite foi acessada em outro dispositivo. Entre novamente para continuar.',
          code: 'LITE_SESSION_REPLACED',
        });
      }
    }

    const billingExempt = req.path === '/profile' || req.path.startsWith('/billing') || req.path.startsWith('/notices') || req.path.startsWith('/notifications');
    if (req.authRole !== 'waiter' && !billingExempt) {
      const access = await getBillingAccess(req.userId);
      if (!access.allowed) {
        return res.status(402).json({
          error: 'Assinatura necessária para continuar',
          code: 'SUBSCRIPTION_REQUIRED',
          billing: serializeBillingAccess(access),
        });
      }
    }

    next();
  } catch (error) {
    // retorna erro se token for inválido
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export default authMiddleware;
