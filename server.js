import express from 'express';

const app = express();

// importa rotas de registro e login
import registerRoutes from './routes/register.js';
import loginRoutes from './routes/login.js';

// configuração do servidor com express.json
app.use(express.json());
app.use('/api', registerRoutes);
app.use('/api', loginRoutes);

// configuração da porta do servidor
const port = process.env.PORT || 3000;

// rota de teste
app.get('/test', (req, res) => {
  res.send('😇 Backend do Foody está rodando!');
});


app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${port}`);
});