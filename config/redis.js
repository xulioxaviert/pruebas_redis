const redis = require('redis');
const dotenv = require('dotenv');

dotenv.config();

// Configuración del cliente Redis
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true
};

// Si hay password, incluirla en la URL
let redisUrl = `redis://${redisConfig.host}:${redisConfig.port}`;
if (redisConfig.password) {
  redisUrl = `redis://:${redisConfig.password}@${redisConfig.host}:${redisConfig.port}`;
}

// Crear cliente Redis
const client = redis.createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
  }
});

// Eventos del cliente Redis
client.on('connect', () => {
  console.log('🔌 Conectando a Redis...');
});

client.on('ready', () => {
  console.log('✅ Redis listo para usar');
});

client.on('error', (err) => {
  console.error('❌ Error de Redis:', err);
});

client.on('end', () => {
  console.log('🔌 Conexión a Redis cerrada');
});

// Conectar al inicializar
client.connect().catch(console.error);

module.exports = client;