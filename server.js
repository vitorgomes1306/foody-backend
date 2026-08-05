import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import slugify from 'slugify';
import { uploadsRoot } from './utils/localUploads.js';

const app = express();

// importa rotas de registro e login
import registerRoutes from './routes/register.js';
import loginRoutes from './routes/login.js';
import profileRoutes from './routes/profile.js';
import authMiddleware from './middlewares/auth.js';
import tenantRoutes from './routes/tenant.js';
import productRoutes from './routes/product.js';
import categoryRoutes from './routes/category.js';
import orderRoutes from './routes/order.js';
import optionsRoutes from './routes/options.js';
import mediaLibraryRoutes from './routes/mediaLibrary.js';
import waiterRoutes from './routes/waiter.js';
import reportRoutes from './routes/report.js';
import healthRoutes from './routes/health.js';
import whatsappRoutes from './routes/whatsapp.js';
import whatsappWebhookRoutes from './routes/whatsappWebhook.js';
import addressRoutes from './routes/address.js';
import printJobRoutes from './routes/printJob.js';



// configuração de CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


// configuração do servidor com express.json
app.use(express.json({
  limit: '5mb',
  verify: (req, _res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  },
}));
app.use('/uploads', express.static(uploadsRoot));
app.use(healthRoutes);
app.use(whatsappWebhookRoutes);
app.use('/api', addressRoutes);
app.use('/api', registerRoutes);
app.use('/api', loginRoutes);
app.use('/api', tenantRoutes);
app.use('/api', profileRoutes);
app.use('/api', productRoutes);
app.use('/api', categoryRoutes);
app.use('/api', orderRoutes);
app.use('/api', optionsRoutes);
app.use('/api', mediaLibraryRoutes);
app.use('/api', waiterRoutes);
app.use('/api', reportRoutes);
app.use('/api', whatsappRoutes);
app.use('/api', printJobRoutes);


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
