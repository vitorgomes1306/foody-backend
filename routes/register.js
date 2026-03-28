// Rota de registro de usuário
import { prisma } from '../prisma/client';

// Registro de usuário com bcrypt

import bcrypt from 'bcrypt';
const saltRounds = 10;
const hashedPassword = await bcrypt.hash(password, saltRounds);

// Registro de usuário no banco de dados
const user = await prisma.user.create({
  data: {
    name,
    email,
    password: hashedPassword,
  },
});


