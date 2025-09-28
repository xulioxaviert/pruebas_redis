# Documentación Técnica: Desarrollo del Chat Backend

## 📖 Resumen Ejecutivo

Este documento explica paso a paso el desarrollo de un sistema de chat en tiempo real utilizando Node.js, Express, Socket.io y Redis. El proyecto fue construido siguiendo principios de arquitectura limpia y patrones de diseño escalables.

---

## 🔧 Paso 1: Configuración Inicial del Proyecto

### 1.1 Estructura Base
Primero cambié del setup inicial de Maven/Java a Node.js:

```bash
# Eliminé los archivos de Maven
rm -rf pom.xml src/

# Creé package.json con todas las dependencias necesarias
```

### 1.2 Dependencias Principales

**Dependencias de Producción:**
- `express`: Framework web minimalista
- `socket.io`: Comunicación bidireccional en tiempo real
- `redis`: Cliente de Redis para Node.js
- `cors`: Manejo de Cross-Origin Resource Sharing
- `dotenv`: Gestión de variables de entorno
- `uuid`: Generación de IDs únicos
- `joi`: Validación de esquemas de datos

**Dependencias de Desarrollo:**
- `nodemon`: Auto-recarga en desarrollo
- `jest`: Framework de testing
- `supertest`: Testing de APIs HTTP
- `testcontainers`: Testing con contenedores

### 1.3 Configuración de Entorno
Creé archivo `.env` con variables configurables:
```env
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
NODE_ENV=development
MAX_MESSAGE_LENGTH=500
MAX_USERS_PER_ROOM=50
MESSAGE_RETENTION_DAYS=7
```

---

## 🏗️ Paso 2: Arquitectura y Estructura del Proyecto

### 2.1 Patrón de Arquitectura Adoptado

Implementé una **arquitectura en capas** con separación de responsabilidades:

```
Presentation Layer (Routes/Handlers)
    ↓
Business Logic Layer (Services)
    ↓
Data Access Layer (Redis)
    ↓
Data Storage (Redis Database)
```

### 2.2 Estructura de Directorios

```
├── config/          # Configuraciones (Redis, base de datos)
├── models/          # Modelos de datos (Message, User, Room)
├── services/        # Lógica de negocio
├── handlers/        # Manejadores de Socket.io
├── routes/          # Rutas REST
├── utils/           # Utilidades y validadores
├── public/          # Frontend estático
└── server.js        # Punto de entrada principal
```

Esta estructura permite:
- **Mantenibilidad**: Cada componente tiene una responsabilidad específica
- **Testabilidad**: Cada capa puede ser testeada independientemente
- **Escalabilidad**: Fácil agregar nuevas funcionalidades

---

## 🗄️ Paso 3: Configuración de Redis

### 3.1 Cliente Redis
Configuré el cliente Redis en `config/redis.js`:

```javascript
const redis = require('redis');

const client = redis.createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
  }
});

// Manejo de eventos de conexión
client.on('connect', () => console.log('🔌 Conectando a Redis...'));
client.on('ready', () => console.log('✅ Redis listo'));
client.on('error', (err) => console.error('❌ Error de Redis:', err));
```

### 3.2 Estrategia de Datos en Redis

**Estructura de Claves:**
- `chat:messages:{messageId}` → Hash con datos del mensaje
- `chat:room_messages:{roomId}` → Lista ordenada de IDs de mensajes
- `chat:users:{userId}` → Hash con datos del usuario
- `chat:room_users:{roomId}` → Set de usuarios en la sala
- `chat:rooms:{roomId}` → Hash con datos de la sala
- `chat:socket_users:{socketId}` → Mapeo socket → user

**Ventajas de esta estructura:**
- **Eficiencia**: Acceso O(1) a datos específicos
- **Escalabilidad**: Estructura plana que escala horizontalmente
- **TTL**: Limpieza automática de datos antiguos
- **Atomicidad**: Operaciones atómicas de Redis

---

## 📊 Paso 4: Modelos de Datos

### 4.1 Modelo Message
```javascript
class Message {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.roomId = data.roomId;
    this.userId = data.userId;
    this.username = data.username;
    this.content = data.content;
    this.timestamp = data.timestamp || new Date().toISOString();
    this.type = data.type || 'text';
  }
  
  // Métodos para validación y conversión a Redis
  isValid() { /* validación */ }
  toRedisObject() { /* serialización */ }
  static fromRedisObject(data) { /* deserialización */ }
}
```

### 4.2 Modelo User
```javascript
class User {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.username = data.username;
    this.socketId = data.socketId;
    this.roomId = data.roomId;
    this.joinedAt = data.joinedAt || new Date().toISOString();
    this.isOnline = data.isOnline !== undefined ? data.isOnline : true;
    this.lastSeen = data.lastSeen || new Date().toISOString();
  }
  
  // Métodos para gestión de estado
  setOffline() { /* marcar como offline */ }
  setOnline(socketId) { /* marcar como online */ }
}
```

### 4.3 Modelo Room
```javascript
class Room {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.description = data.description || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.createdBy = data.createdBy;
    this.isPrivate = data.isPrivate || false;
    this.maxUsers = data.maxUsers || 50;
    this.userCount = data.userCount || 0;
  }
  
  // Métodos para gestión de capacidad
  isFull() { return this.userCount >= this.maxUsers; }
  incrementUserCount() { this.userCount++; }
  decrementUserCount() { if (this.userCount > 0) this.userCount--; }
}
```

---

## 🔄 Paso 5: Servicios (Lógica de Negocio)

### 5.1 MessageService
Responsabilidades:
- Guardar mensajes en Redis con TTL
- Mantener listas ordenadas de mensajes por sala
- Limitar historial (últimos 1000 mensajes)
- Búsqueda y recuperación eficiente

```javascript
class MessageService {
  async saveMessage(messageData) {
    const message = new Message(messageData);
    
    // Guardar mensaje
    await this.redis.hSet(messageKey, message.toRedisObject());
    
    // Añadir a lista de sala
    await this.redis.lPush(roomMessagesKey, message.id);
    
    // Limitar historial
    await this.redis.lTrim(roomMessagesKey, 0, 999);
    
    // TTL para auto-limpieza
    await this.redis.expire(messageKey, ttl);
  }
}
```

### 5.2 UserService
Responsabilidades:
- Gestión de usuarios y estados online/offline
- Mapeo socket ↔ usuario
- Gestión de usuarios por sala
- Cleanup automático

### 5.3 RoomService
Responsabilidades:
- CRUD de salas de chat
- Control de capacidad de salas
- Búsqueda de salas
- Gestión de permisos

---

## 🔌 Paso 6: Comunicación en Tiempo Real (Socket.io)

### 6.1 Handlers de Socket.io
Implementé handlers para todos los eventos del chat:

```javascript
module.exports = (socket, io, redisClient) => {
  // Usuario se conecta
  socket.on('user:join', async (data) => {
    // Crear/actualizar usuario
    // Asignar socket ID
    // Emitir confirmación
  });

  // Usuario se une a sala
  socket.on('room:join', async (data) => {
    // Validar sala y permisos
    // Unirse a room de Socket.io
    // Actualizar Redis
    // Notificar a otros usuarios
  });

  // Envío de mensajes
  socket.on('message:send', async (data) => {
    // Validar mensaje
    // Guardar en Redis
    // Broadcast a sala
  });
  
  // Cleanup al desconectar
  socket.on('disconnect', async () => {
    // Salir de salas
    // Actualizar estado
    // Limpiar mapeos
  });
};
```

### 6.2 Eventos Implementados

**Cliente → Servidor:**
- `user:join` - Autenticación inicial
- `room:join` - Unirse a sala
- `message:send` - Enviar mensaje
- `typing:start/stop` - Indicadores de escritura
- `room:leave` - Salir de sala

**Servidor → Cliente:**
- `user:joined` - Confirmación de conexión
- `room:joined` - Confirmación + datos de sala
- `message:new` - Nuevo mensaje
- `user:entered/left` - Cambios de usuarios
- `user:typing` - Indicadores de escritura
- `error` - Manejo de errores

---

## 🛣️ Paso 7: API REST

### 7.1 Rutas de Salas (`/api/rooms`)
```javascript
GET    /api/rooms              # Listar salas públicas
GET    /api/rooms/:roomId      # Obtener sala específica
POST   /api/rooms              # Crear nueva sala
PUT    /api/rooms/:roomId      # Actualizar sala
DELETE /api/rooms/:roomId      # Eliminar sala
GET    /api/rooms/:roomId/users # Usuarios de la sala
```

### 7.2 Rutas de Mensajes (`/api/messages`)
```javascript
GET    /api/messages/room/:roomId    # Mensajes de sala (paginado)
GET    /api/messages/:messageId     # Mensaje específico
DELETE /api/messages/:messageId     # Eliminar mensaje
```

### 7.3 Paginación y Filtros
Implementé paginación eficiente:
```javascript
router.get('/room/:roomId', async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const messages = await messageService.getRoomMessages(roomId, limit, offset);
  
  res.json({
    success: true,
    data: messages,
    pagination: { limit, offset, total }
  });
});
```

---

## 🛡️ Paso 8: Validación y Seguridad

### 8.1 Validación con Joi
```javascript
const messageSchema = Joi.object({
  content: Joi.string().trim().min(1).max(500).required()
});

const validateMessage = (data) => {
  const { error } = messageSchema.validate(data);
  return {
    isValid: !error,
    error: error ? error.details[0].message : null
  };
};
```

### 8.2 Medidas de Seguridad Implementadas
- **Sanitización HTML**: Prevención de XSS
- **Validación de entrada**: Joi schemas
- **Rate limiting**: Límite de mensajes por minuto
- **TTL en Redis**: Auto-limpieza de datos
- **Límites de longitud**: Mensajes y usernames
- **Escape de caracteres**: En el frontend

---

## 💻 Paso 9: Frontend de Prueba

### 9.1 Interfaz Web Simple
Creé una SPA básica con:
- HTML semántico y responsive
- CSS Grid/Flexbox para layout
- JavaScript vanilla para Socket.io
- UX intuitiva para testing

### 9.2 Funcionalidades del Cliente
```javascript
// Conexión Socket.io
socket = io();

// Manejo de eventos
socket.on('message:new', displayMessage);
socket.on('user:typing', showTypingIndicator);

// Envío de mensajes
function sendMessage() {
  socket.emit('message:send', { content });
}

// Indicadores de escritura
function handleTyping() {
  socket.emit('typing:start');
  // Auto-stop después de 1 segundo
}
```

---

## 🔧 Paso 10: Servidor Principal

### 10.1 Configuración Express + Socket.io
```javascript
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rutas
app.use('/api/messages', messageRoutes);
app.use('/api/rooms', roomRoutes);

// Socket.io
io.on('connection', (socket) => {
  chatHandlers(socket, io, redisClient);
});
```

### 10.2 Health Check y Monitoring
```javascript
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    redis: redisClient.isOpen ? 'connected' : 'disconnected'
  });
});
```

### 10.3 Graceful Shutdown
```javascript
process.on('SIGTERM', async () => {
  console.log('Cerrando servidor...');
  await redisClient.quit();
  server.close(() => {
    console.log('Servidor cerrado');
    process.exit(0);
  });
});
```

---

## 🎯 Decisiones de Arquitectura y Por Qué

### 1. **¿Por qué Redis?**
- **Velocidad**: Estructura en memoria, muy rápido
- **Pub/Sub**: Ideal para chat en tiempo real
- **Estructuras de datos**: Lists, Sets, Hashes perfectos para chat
- **TTL**: Auto-limpieza de mensajes antiguos
- **Escalabilidad**: Fácil clustering

### 2. **¿Por qué Socket.io?**
- **Tiempo real**: WebSockets con fallbacks
- **Rooms**: Perfecto para salas de chat
- **Event-driven**: Arquitectura natural para chat
- **Broadcast**: Envío eficiente a múltiples usuarios

### 3. **¿Por qué Arquitectura en Capas?**
- **Separación de responsabilidades**
- **Testabilidad**: Cada capa independiente
- **Mantenibilidad**: Cambios aislados
- **Escalabilidad**: Fácil agregar features

### 4. **¿Por qué Validación con Joi?**
- **Esquemas declarativos**
- **Validación robusta**
- **Error handling consistente**
- **Facilita testing**

---

## 📈 Optimizaciones Implementadas

### 1. **Redis Optimizations**
```javascript
// Usar pipelines para operaciones múltiples
const pipeline = redis.pipeline();
pipeline.hSet(messageKey, messageData);
pipeline.lPush(roomMessagesKey, messageId);
pipeline.lTrim(roomMessagesKey, 0, 999);
await pipeline.exec();

// TTL para auto-limpieza
await redis.expire(key, seconds);
```

### 2. **Socket.io Optimizations**
```javascript
// Rooms para targeting eficiente
socket.join(roomId);
io.to(roomId).emit('message:new', message);

// Namespaces para separar lógica
const chatNamespace = io.of('/chat');
```

### 3. **Memory Management**
- TTL en todos los datos temporales
- Límites en historial de mensajes
- Cleanup automático de usuarios desconectados
- Paginación en APIs

---

## 🧪 Testing Strategy (Preparado para)

### 1. **Unit Tests**
```javascript
describe('MessageService', () => {
  test('should save message with TTL', async () => {
    const message = await messageService.saveMessage(data);
    expect(message.id).toBeDefined();
  });
});
```

### 2. **Integration Tests**
```javascript
describe('Chat API', () => {
  test('POST /api/rooms should create room', async () => {
    const response = await request(app)
      .post('/api/rooms')
      .send({ name: 'Test Room' });
    expect(response.status).toBe(201);
  });
});
```

### 3. **E2E Tests con Socket.io**
```javascript
describe('Chat Flow', () => {
  test('should allow user to join and send message', (done) => {
    const client = io.connect(socketURL);
    client.emit('user:join', { username: 'test' });
    // ... test completo
  });
});
```

---

## 🚀 Deployment Considerations

### 1. **Environment Variables**
```bash
# Producción
NODE_ENV=production
REDIS_URL=redis://user:pass@host:port
PORT=3000
```

### 2. **Process Management**
```bash
# PM2 para producción
pm2 start server.js --name chat-app
pm2 startup
pm2 save
```

### 3. **Docker Ready**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 📊 Métricas y Monitoring

### 1. **Health Checks**
- Endpoint `/health` con status de Redis
- Verificación de conexiones activas
- Métricas de memoria y performance

### 2. **Logging Strategy**
```javascript
// Structured logging
console.log(`Usuario ${username} se unió a sala ${roomName}`);
console.error('Error en message:send:', error);
```

### 3. **Redis Monitoring**
```bash
# Comandos útiles
redis-cli info stats
redis-cli monitor
redis-cli --latency
```

---

## 🎉 Resultado Final

He creado un sistema de chat completo y funcional con:

✅ **Backend robusto** con Node.js + Express + Socket.io  
✅ **Base de datos eficiente** con Redis  
✅ **Comunicación en tiempo real** bidireccional  
✅ **API REST** completa para gestión  
✅ **Validación y seguridad** implementadas  
✅ **Frontend funcional** para testing  
✅ **Arquitectura escalable** y mantenible  
✅ **Documentación completa**  

El sistema está listo para usar y puede manejar múltiples usuarios, salas de chat, persistencia de mensajes, y todas las funcionalidades esperadas de un chat moderno.

**¿Quieres que profundice en algún aspecto específico o que agregue alguna funcionalidad adicional?**