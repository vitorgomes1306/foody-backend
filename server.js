import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import slugify from 'slugify';

const app = express();

// importa rotas de registro e login
import registerRoutes from './routes/register.js';
import loginRoutes from './routes/login.js';
import profileRoutes from './routes/profile.js';
import authMiddleware from './middlewares/auth.js';
import tenantRoutes from './routes/tenant.js';
import productRoutes from './routes/product.js';
import categoryRoutes from './routes/category.js';



// configuração de CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


// configuração do servidor com express.json
app.use(express.json());
app.use('/api', registerRoutes);
app.use('/api', loginRoutes);
app.use('/api', tenantRoutes);
app.use('/api', profileRoutes);
app.use('/api', productRoutes);
app.use('/api', categoryRoutes);


// configuração da porta do servidor
const port = process.env.PORT || 3000;

// rota de teste
app.get('/test', async (req, res) => {
  res.send(`🍔 Backend do Foody está rodando`);
});

// configuração do servidor
app.listen(port, '0.0.0.0', async () => {
  console.log(`Servidor rodando na porta ${port}`);
});
