// importa o jwt para verificar tokens
import jwt from 'jsonwebtoken';

// middleware para verificar tokens
export function authMiddleware(req, res, next) {
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

    next();
  } catch (error) {
    // retorna erro se token for inválido
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export default authMiddleware;