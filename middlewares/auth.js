// importa o jwt para verificar tokens
import jwt from 'jsonwebtoken';
import { getBillingAccess, serializeBillingAccess } from '../utils/billing.js';

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

    const billingExempt = req.path === '/profile' || req.path.startsWith('/billing');
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
