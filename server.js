import express from 'express';
import cors from 'cors';

const app = express();

// importa rotas de registro e login
import registerRoutes from './routes/register.js';
import loginRoutes from './routes/login.js';
import profileRoutes from './routes/profile.js';
import authMiddleware from './middlewares/auth.js';
//import pegarIP from './utils/ipAddress.js';

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
app.use('/api', profileRoutes);

// configuração da porta do servidor
const port = process.env.PORT || 3000;

// extrai a data e hora atual
//const currentDate = new Date();
//const currentDateTime = `${currentDate.toLocaleDateString()} ${currentDate.toLocaleTimeString()}`;

// rota de teste
app.get('/test', async (req, res) => {
  res.send(`😇 Backend do Foody está rodando`);
});

// configuração do servidor
app.listen(port, '0.0.0.0', async () => {
  console.log(`Servidor rodando na porta ${port}`);
});
