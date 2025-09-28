const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const redisClient = require('./config/redis');
const chatHandlers = require('./handlers/chatHandlers');
const messageRoutes = require('./routes/messageRoutes');
const roomRoutes = require('./routes/roomRoutes');

// Cargar variables de entorno
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rutas
app.use('/api/messages', messageRoutes);
app.use('/api/rooms', roomRoutes);

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    redis: redisClient.isOpen ? 'connected' : 'disconnected'
  });
});

// Configurar Socket.io
io.on('connection', (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);
  
  // Configurar handlers de chat
  chatHandlers(socket, io, redisClient);
  
  socket.on('disconnect', () => {
    console.log(`Usuario desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;

// Iniciar servidor
server.listen(PORT, async () => {
  try {
    // Verificar conexión con Redis
    await redisClient.ping();
    console.log('✅ Conectado a Redis');
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  } catch (error) {
    console.error('❌ Error conectando a Redis:', error);
    process.exit(1);
  }
});

// Manejo de cierre graceful
process.on('SIGTERM', async () => {
  console.log('Cerrando servidor...');
  await redisClient.quit();
  server.close(() => {
    console.log('Servidor cerrado');
    process.exit(0);
  });
});

module.exports = { app, io, server };