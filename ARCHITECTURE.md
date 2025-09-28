# 📚 Arquitectura y Explicación Paso a Paso

## 🎯 Objetivo del Proyecto

Crear un **sistema de chat en tiempo real** que permita:
- Múltiples usuarios conectados simultáneamente
- Salas de chat dinámicas
- Mensajes persistentes
- Indicadores de escritura
- Interface web simple para pruebas

## 🏗 Paso a Paso de la Construcción

### 1. **Configuración Inicial del Proyecto**

#### ¿Qué hice?
Configuré la estructura base de un proyecto Node.js con todas las dependencias necesarias.

#### ¿Cómo lo hice?

```javascript
// package.json - Definí las dependencias del proyecto
{
  "dependencies": {
    "express": "^4.18.2",      // Framework web para APIs REST
    "socket.io": "^4.7.2",     // WebSockets para tiempo real
    "redis": "^4.6.7",         // Cliente de Redis
    "cors": "^2.8.5",          // Manejo de CORS
    "dotenv": "^16.3.1",       // Variables de entorno
    "uuid": "^9.0.0",          // Generación de IDs únicos
    "joi": "^17.9.2"           // Validación de datos
  }
}
```

#### ¿Por qué estas tecnologías?

- **Express**: Framework minimalista y rápido para crear APIs
- **Socket.io**: Abstrae WebSockets y maneja reconexiones automáticamente
- **Redis**: Base de datos en memoria, perfecta para chat (rápida y con TTL)
- **Joi**: Validador robusto que previene errores de datos inválidos
- **UUID**: Genera IDs únicos para mensajes, usuarios y salas

---

### 2. **Configuración de Redis**

#### ¿Qué hace este archivo?
`config/redis.js` establece la conexión con Redis y maneja errores de conexión.

```javascript
// config/redis.js
const redis = require('redis');

// Configuración con reconexión automática
const client = redis.createClient({
  url: redisUrl,
  socket: {
    // Estrategia de reconexión: retries * 50ms, máximo 500ms
    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
  }
});

// Eventos importantes para monitoreo
client.on('ready', () => console.log('✅ Redis listo'));
client.on('error', (err) => console.error('❌ Error Redis:', err));
```

#### ¿Por qué esta configuración?

1. **Reconexión automática**: Si Redis se desconecta, el cliente intenta reconectarse
2. **Estrategia exponential backoff**: Evita saturar Redis con intentos de reconexión
3. **Eventos de monitoreo**: Nos permite saber el estado de la conexión
4. **URL dinámica**: Soporta autenticación con password si es necesario

---

### 3. **Modelos de Datos**

#### **Message.js** - Estructura de Mensajes

```javascript
class Message {
  constructor(data) {
    this.id = data.id || uuidv4();         // ID único del mensaje
    this.roomId = data.roomId;             // Sala donde se envió
    this.userId = data.userId;             // Quien lo envió
    this.username = data.username;         // Nombre visible del usuario
    this.content = data.content;           // Contenido del mensaje
    this.timestamp = data.timestamp || new Date().toISOString(); // Cuándo se envió
    this.type = data.type || 'text';       // Tipo: text, image, system
  }

  // Convierte el objeto a formato plano para Redis
  toRedisObject() {
    return {
      id: this.id,
      roomId: this.roomId,
      userId: this.userId,
      username: this.username,
      content: this.content,
      timestamp: this.timestamp,
      type: this.type
    };
  }

  // Validación de datos
  isValid() {
    return !!(
      this.roomId && 
      this.userId && 
      this.username && 
      this.content && 
      this.content.trim().length > 0 &&
      this.content.length <= 500  // Límite de caracteres
    );
  }
}
```

#### ¿Por qué esta estructura?

1. **IDs únicos**: Cada mensaje tiene un UUID para evitar colisiones
2. **Timestamps ISO**: Formato estándar para fechas, compatible con JavaScript
3. **Validación incorporada**: Previene datos corruptos en Redis
4. **Flexibilidad de tipos**: Soporta mensajes de texto y del sistema
5. **Serialización**: Métodos para convertir entre objeto JS y Redis

#### **User.js** - Gestión de Usuarios

```javascript
class User {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.username = data.username;
    this.socketId = data.socketId;         // Conexión WebSocket actual
    this.roomId = data.roomId;             // Sala actual (si existe)
    this.joinedAt = data.joinedAt || new Date().toISOString();
    this.isOnline = data.isOnline !== undefined ? data.isOnline : true;
    this.lastSeen = data.lastSeen || new Date().toISOString();
  }

  // Marcar usuario como desconectado
  setOffline() {
    this.isOnline = false;
    this.lastSeen = new Date().toISOString();
  }

  // Marcar usuario como conectado con nuevo socket
  setOnline(socketId) {
    this.isOnline = true;
    this.socketId = socketId;
    this.lastSeen = new Date().toISOString();
  }
}
```

#### ¿Por qué esta estructura?

1. **Estado online/offline**: Permite mostrar usuarios activos
2. **Socket ID tracking**: Mapea usuarios a conexiones WebSocket
3. **Sala actual**: Rastrea en qué sala está cada usuario
4. **Last seen**: Para mostrar "última vez visto"
5. **Métodos de estado**: Facilita cambios de estado online/offline

#### **Room.js** - Salas de Chat

```javascript
class Room {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.description = data.description || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.createdBy = data.createdBy;       // Usuario que creó la sala
    this.isPrivate = data.isPrivate || false;
    this.maxUsers = data.maxUsers || 50;   // Límite de usuarios
    this.userCount = data.userCount || 0;  // Contador actual
  }

  // Verificar si la sala está llena
  isFull() {
    return this.userCount >= this.maxUsers;
  }

  // Métodos para manejar contador de usuarios
  incrementUserCount() { this.userCount++; }
  decrementUserCount() { 
    if (this.userCount > 0) this.userCount--; 
  }
}
```

#### ¿Por qué esta estructura?

1. **Límites de usuarios**: Previene saturación de salas
2. **Metadatos**: Descripción y creador para contexto
3. **Privacidad**: Soporte para salas privadas (futuro)
4. **Contador en tiempo real**: Muestra usuarios activos sin consultar Redis constantemente
5. **Validación de capacidad**: Previene uniones a salas llenas

---

### 4. **Servicios de Negocio**

#### **MessageService.js** - Lógica de Mensajes

```javascript
class MessageService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.MESSAGE_KEY_PREFIX = 'chat:messages:';           // Mensajes individuales
    this.ROOM_MESSAGES_KEY_PREFIX = 'chat:room_messages:'; // Lista por sala
  }

  // Guardar mensaje con múltiples operaciones Redis
  async saveMessage(messageData) {
    const message = new Message(messageData);
    
    if (!message.isValid()) {
      throw new Error('Datos del mensaje inválidos');
    }

    const messageKey = `${this.MESSAGE_KEY_PREFIX}${message.id}`;
    const roomMessagesKey = `${this.ROOM_MESSAGES_KEY_PREFIX}${message.roomId}`;

    // 1. Guardar el mensaje como Hash
    await this.redis.hSet(messageKey, message.toRedisObject());
    
    // 2. Añadir ID a la lista de mensajes de la sala
    await this.redis.lPush(roomMessagesKey, message.id);
    
    // 3. Limitar mensajes por sala (últimos 1000)
    await this.redis.lTrim(roomMessagesKey, 0, 999);
    
    // 4. TTL automático (7 días por defecto)
    const ttl = parseInt(process.env.MESSAGE_RETENTION_DAYS) * 24 * 60 * 60 || 604800;
    await this.redis.expire(messageKey, ttl);

    return message;
  }

  // Obtener mensajes con paginación
  async getRoomMessages(roomId, limit = 50, offset = 0) {
    const roomMessagesKey = `${this.ROOM_MESSAGES_KEY_PREFIX}${roomId}`;
    
    // 1. Obtener IDs de mensajes (más recientes primero)
    const messageIds = await this.redis.lRange(roomMessagesKey, offset, offset + limit - 1);
    
    // 2. Obtener datos completos de cada mensaje
    const messages = [];
    for (const messageId of messageIds) {
      const messageKey = `${this.MESSAGE_KEY_PREFIX}${messageId}`;
      const messageData = await this.redis.hGetAll(messageKey);
      
      if (Object.keys(messageData).length > 0) {
        messages.push(Message.fromRedisObject(messageData));
      }
    }

    return messages.reverse(); // Orden cronológico
  }
}
```

#### ¿Por qué esta arquitectura de datos?

**Estructura en Redis:**
```redis
# Mensaje individual (Hash) - Acceso rápido por ID
chat:messages:abc123 = {
  id: "abc123",
  roomId: "room456", 
  userId: "user789",
  username: "Juan",
  content: "Hola mundo!",
  timestamp: "2025-09-28T10:30:00.000Z",
  type: "text"
}

# Lista de mensajes por sala (List) - Orden cronológico
chat:room_messages:room456 = [abc123, def456, ghi789]
```

**Ventajas:**
1. **Acceso rápido**: Hash permite obtener mensaje completo en O(1)
2. **Orden cronológico**: List mantiene el orden de llegada
3. **Paginación eficiente**: lRange permite páginas sin cargar todo
4. **Límite automático**: lTrim previene crecimiento infinito
5. **TTL por mensaje**: Limpieza automática de datos antiguos

#### **UserService.js** - Gestión de Usuarios

```javascript
class UserService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.USER_KEY_PREFIX = 'chat:users:';              // Datos de usuario
    this.ROOM_USERS_KEY_PREFIX = 'chat:room_users:';   // Usuarios por sala
    this.SOCKET_USER_KEY_PREFIX = 'chat:socket_users:'; // Mapeo socket->usuario
  }

  // Guardar usuario con múltiples mapeos
  async saveUser(userData) {
    const user = new User(userData);
    
    const userKey = `${this.USER_KEY_PREFIX}${user.id}`;
    const socketUserKey = `${this.SOCKET_USER_KEY_PREFIX}${user.socketId}`;

    // 1. Guardar datos completos del usuario
    await this.redis.hSet(userKey, user.toRedisObject());
    
    // 2. Mapear socket ID a user ID (para lookups rápidos)
    await this.redis.set(socketUserKey, user.id);
    
    // 3. TTL de 24 horas para limpieza automática
    await this.redis.expire(userKey, 86400);
    await this.redis.expire(socketUserKey, 86400);

    return user;
  }

  // Añadir usuario a sala usando Set
  async addUserToRoom(userId, roomId) {
    const roomUsersKey = `${this.ROOM_USERS_KEY_PREFIX}${roomId}`;
    
    // Set previene duplicados automáticamente
    await this.redis.sAdd(roomUsersKey, userId);
    
    // Actualizar la sala actual del usuario
    const userKey = `${this.USER_KEY_PREFIX}${userId}`;
    await this.redis.hSet(userKey, 'roomId', roomId);
  }

  // Contar usuarios únicos en sala
  async countRoomUsers(roomId) {
    const roomUsersKey = `${this.ROOM_USERS_KEY_PREFIX}${roomId}`;
    return await this.redis.sCard(roomUsersKey); // Operación O(1)
  }
}
```

#### ¿Por qué esta arquitectura?

**Estructura en Redis:**
```redis
# Usuario individual (Hash)
chat:users:user123 = {
  id: "user123",
  username: "Juan",
  socketId: "socket456",
  roomId: "room789",
  isOnline: "true",
  lastSeen: "2025-09-28T10:30:00.000Z"
}

# Usuarios por sala (Set) - Sin duplicados
chat:room_users:room789 = {user123, user456, user789}

# Mapeo rápido socket->usuario (String)
chat:socket_users:socket456 = "user123"
```

**Ventajas:**
1. **Lookups eficientes**: Encontrar usuario por socket en O(1)
2. **Sin duplicados**: Set previene usuarios duplicados en salas
3. **Conteo rápido**: sCard cuenta elementos en O(1)
4. **TTL automático**: Limpieza de usuarios inactivos
5. **Doble mapeo**: Socket->User y User->Room para navegación rápida

---

### 5. **Handlers de Socket.io**

#### **chatHandlers.js** - Eventos en Tiempo Real

```javascript
module.exports = (socket, io, redisClient) => {
  const messageService = new MessageService(redisClient);
  const userService = new UserService(redisClient);
  const roomService = new RoomService(redisClient);

  // Usuario se conecta al chat
  socket.on('user:join', async (data) => {
    try {
      const { username } = data;
      
      // Validación de entrada
      if (!username || username.trim().length === 0) {
        socket.emit('error', { message: 'Nombre de usuario requerido' });
        return;
      }

      // Crear usuario en Redis
      const user = await userService.saveUser({
        username: username.trim(),
        socketId: socket.id
      });

      // Guardar datos en el socket para uso posterior
      socket.userId = user.id;
      socket.username = user.username;

      // Confirmar conexión al cliente
      socket.emit('user:joined', {
        userId: user.id,
        username: user.username,
        message: 'Conectado exitosamente'
      });

    } catch (error) {
      console.error('Error en user:join:', error);
      socket.emit('error', { message: 'Error al conectar usuario' });
    }
  });

  // Usuario se une a una sala
  socket.on('room:join', async (data) => {
    try {
      const { roomId } = data;
      
      // Verificaciones de seguridad
      if (!socket.userId) {
        socket.emit('error', { message: 'Debes identificarte primero' });
        return;
      }

      const room = await roomService.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Sala no encontrada' });
        return;
      }

      // Verificar capacidad
      const canJoin = await roomService.canUserJoinRoom(roomId, socket.userId);
      if (!canJoin.canJoin) {
        socket.emit('error', { message: canJoin.reason });
        return;
      }

      // Salir de sala anterior si existe
      if (socket.currentRoom) {
        await handleLeaveRoom(socket.currentRoom);
      }

      // Operaciones de unión
      socket.join(roomId);                                    // Socket.io room
      socket.currentRoom = roomId;                           // Estado local
      await userService.addUserToRoom(socket.userId, roomId); // Redis

      // Actualizar contador
      const userCount = await userService.countRoomUsers(roomId);
      await roomService.updateUserCount(roomId, userCount);

      // Obtener datos para el cliente
      const users = await userService.getRoomUsers(roomId);
      const messages = await messageService.getRoomMessages(roomId, 50);

      // Respuesta al usuario que se une
      socket.emit('room:joined', {
        roomId,
        roomName: room.name,
        users: users.map(u => ({ 
          id: u.id, 
          username: u.username, 
          isOnline: u.isOnline 
        })),
        messages,
        userCount
      });

      // Notificar a otros usuarios en la sala
      socket.to(roomId).emit('user:entered', {
        userId: socket.userId,
        username: socket.username,
        userCount
      });

      // Mensaje del sistema
      const systemMessage = await messageService.saveMessage({
        roomId,
        userId: 'system',
        username: 'Sistema',
        content: `${socket.username} se unió a la sala`,
        type: 'system'
      });

      // Enviar mensaje del sistema a todos
      io.to(roomId).emit('message:new', systemMessage);

    } catch (error) {
      console.error('Error en room:join:', error);
      socket.emit('error', { message: 'Error al unirse a la sala' });
    }
  });

  // Envío de mensajes
  socket.on('message:send', async (data) => {
    try {
      const { content } = data;

      // Validaciones
      if (!socket.userId || !socket.currentRoom) {
        socket.emit('error', { message: 'Debes estar en una sala' });
        return;
      }

      // Crear y guardar mensaje
      const message = await messageService.saveMessage({
        roomId: socket.currentRoom,
        userId: socket.userId,
        username: socket.username,
        content: content.trim()
      });

      // Enviar a todos los usuarios de la sala
      io.to(socket.currentRoom).emit('message:new', message);

    } catch (error) {
      console.error('Error en message:send:', error);
      socket.emit('error', { message: 'Error al enviar mensaje' });
    }
  });

  // Indicadores de escritura
  socket.on('typing:start', () => {
    if (socket.currentRoom && socket.username) {
      socket.to(socket.currentRoom).emit('user:typing', {
        userId: socket.userId,
        username: socket.username
      });
    }
  });

  socket.on('typing:stop', () => {
    if (socket.currentRoom && socket.username) {
      socket.to(socket.currentRoom).emit('user:stopped_typing', {
        userId: socket.userId,
        username: socket.username
      });
    }
  });
};
```

#### ¿Por qué esta estructura de eventos?

1. **Separación de responsabilidades**: Cada evento tiene una función específica
2. **Validación en cada step**: Previene estados inconsistentes
3. **Manejo de errores**: Cada operación puede fallar, se notifica al cliente
4. **Estado en socket**: socket.userId y socket.currentRoom para acceso rápido
5. **Broadcasts selectivos**: Mensajes solo a usuarios relevantes
6. **Limpieza automática**: handleLeaveRoom se ejecuta al desconectar

---

### 6. **API REST Endpoints**

#### **roomRoutes.js** - CRUD de Salas

```javascript
// GET /api/rooms - Obtener salas públicas
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    
    let rooms;
    if (search) {
      rooms = await roomService.searchRooms(search);
    } else {
      rooms = await roomService.getPublicRooms();
    }

    // Añadir información en tiempo real
    const roomsWithInfo = await Promise.all(
      rooms.map(async (room) => {
        const userCount = await userService.countRoomUsers(room.id);
        return {
          ...room.toRedisObject(),
          userCount,
          isFull: userCount >= room.maxUsers
        };
      })
    );

    res.json({ success: true, data: roomsWithInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al obtener salas' });
  }
});

// POST /api/rooms - Crear nueva sala
router.post('/', async (req, res) => {
  try {
    const validation = validateCreateRoom(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const room = await roomService.createRoom(req.body);
    res.status(201).json({
      success: true,
      data: room.toRedisObject(),
      message: 'Sala creada exitosamente'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error al crear sala' });
  }
});
```

#### ¿Por qué API REST además de WebSockets?

1. **CRUD operations**: Crear/leer/actualizar/eliminar salas
2. **Independiente de conexión**: Funciona sin WebSocket activo
3. **Cacheable**: Los GETs pueden ser cacheados por proxies
4. **Testeable**: Más fácil de testear que WebSockets
5. **Integración**: Otras aplicaciones pueden usar la API

---

### 7. **Frontend de Prueba**

#### **index.html** - Interfaz Web

```html
<!-- Estructura responsiva con sidebar -->
<div class="sidebar">
  <div class="sidebar-header">
    <h2>Chat Redis</h2>
    <div class="user-info">
      <span id="currentUsername">No conectado</span>
    </div>
  </div>
  
  <div class="rooms-section">
    <h3>Salas</h3>
    <ul id="roomsList" class="room-list"></ul>
  </div>
  
  <div class="create-room">
    <input type="text" id="newRoomName" placeholder="Nueva sala">
    <button onclick="createRoom()">Crear Sala</button>
  </div>
</div>

<div class="chat-container">
  <div class="chat-header">
    <h2 id="currentRoomName">Selecciona una sala</h2>
    <div class="room-info">
      <span id="roomUserCount">0 usuarios</span>
    </div>
  </div>
  
  <div id="messagesContainer" class="messages-container"></div>
  <div id="typingIndicator" class="typing-indicator hidden"></div>
  
  <div class="message-input-container">
    <input type="text" id="messageInput" placeholder="Escribe tu mensaje...">
    <button onclick="sendMessage()">Enviar</button>
  </div>
</div>
```

#### **chat.js** - Cliente JavaScript

```javascript
// Variables globales para estado
let socket = null;
let currentUserId = null;
let currentUsername = null;
let currentRoomId = null;

// Inicializar conexión Socket.io
function initializeSocketConnection() {
  socket = io();

  // Eventos de conexión
  socket.on('connect', () => {
    console.log('Conectado al servidor');
  });

  // Usuario conectado exitosamente
  socket.on('user:joined', (data) => {
    currentUserId = data.userId;
    currentUsername = data.username;
    document.getElementById('currentUsername').textContent = currentUsername;
    document.getElementById('loginContainer').classList.add('hidden');
  });

  // Unión a sala exitosa
  socket.on('room:joined', (data) => {
    currentRoomId = data.roomId;
    document.getElementById('currentRoomName').textContent = data.roomName;
    document.getElementById('roomUserCount').textContent = `${data.userCount} usuarios`;
    
    // Limpiar y cargar mensajes
    clearMessages();
    data.messages.forEach(message => displayMessage(message));
    
    // Habilitar input
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendButton').disabled = false;
  });

  // Nuevo mensaje recibido
  socket.on('message:new', (message) => {
    displayMessage(message);
    scrollToBottom();
  });

  // Indicadores de escritura
  socket.on('user:typing', (data) => {
    showTypingIndicator(`${data.username} está escribiendo...`);
  });
}

// Mostrar mensaje en la interfaz
function displayMessage(message) {
  const messagesContainer = document.getElementById('messagesContainer');
  const messageElement = document.createElement('div');
  
  if (message.type === 'system') {
    messageElement.className = 'message system';
    messageElement.innerHTML = `<div class="message-content">${escapeHtml(message.content)}</div>`;
  } else {
    const isOwnMessage = message.userId === currentUserId;
    messageElement.className = `message ${isOwnMessage ? 'own' : 'other'}`;
    
    const timestamp = new Date(message.timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit'
    });
    
    messageElement.innerHTML = `
      <div class="message-header">
        ${isOwnMessage ? 'Tú' : escapeHtml(message.username)} - ${timestamp}
      </div>
      <div class="message-content">${escapeHtml(message.content)}</div>
    `;
  }
  
  messagesContainer.appendChild(messageElement);
  scrollToBottom();
}

// Enviar mensaje
function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  const content = messageInput.value.trim();
  
  if (!content || !currentRoomId) return;

  socket.emit('message:send', { content });
  messageInput.value = '';
}
```

#### ¿Por qué esta estructura de frontend?

1. **SPA simple**: Una sola página con cambios dinámicos
2. **Estado global**: Variables para trackear usuario y sala actual
3. **Event-driven**: Responde a eventos de Socket.io
4. **Responsive**: Sidebar colapsable para móviles
5. **Validación cliente**: Previene envíos inválidos
6. **Escape HTML**: Previene XSS de contenido de usuario

---

### 8. **Validación y Seguridad**

#### **validators.js** - Validaciones con Joi

```javascript
const Joi = require('joi');

// Esquema para mensajes
const messageSchema = Joi.object({
  content: Joi.string().trim().min(1).max(500).required()
});

// Esquema para crear salas
const createRoomSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(500).optional().allow(''),
  isPrivate: Joi.boolean().optional(),
  maxUsers: Joi.number().integer().min(1).max(200).optional(),
  createdBy: Joi.string().required()
});

// Función de validación
const validateMessage = (data) => {
  const { error } = messageSchema.validate(data);
  return {
    isValid: !error,
    error: error ? error.details[0].message : null
  };
};

// Sanitización HTML básica
const sanitizeHtml = (content) => {
  return content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};
```

#### ¿Por qué estas validaciones?

1. **Joi schemas**: Validación declarativa y robusta
2. **Límites de longitud**: Previene mensajes muy largos
3. **Sanitización HTML**: Previene ataques XSS
4. **Validación UUIDs**: Previene IDs malformados
5. **Rate limiting**: Previene spam (implementación básica)

---

### 9. **Flujo Completo de Datos**

#### Ejemplo: Usuario envía mensaje

```
1. [Frontend] Usuario escribe "Hola mundo!" y presiona Enter
   └── chat.js: sendMessage() 
       └── socket.emit('message:send', { content: 'Hola mundo!' })

2. [Backend] Servidor recibe evento
   └── chatHandlers.js: socket.on('message:send')
       ├── Validar que usuario esté en sala
       ├── Validar contenido del mensaje
       └── messageService.saveMessage()

3. [Redis] Guardar mensaje
   └── MessageService.saveMessage()
       ├── Crear objeto Message con UUID
       ├── HSET chat:messages:abc123 {datos del mensaje}
       ├── LPUSH chat:room_messages:room456 abc123
       ├── LTRIM chat:room_messages:room456 0 999
       └── EXPIRE chat:messages:abc123 604800

4. [Socket.io] Broadcast a sala
   └── io.to(roomId).emit('message:new', message)

5. [Frontend] Otros usuarios reciben mensaje
   └── socket.on('message:new', displayMessage)
       └── Crear elemento HTML y añadir a chat
```

#### ¿Por qué este flujo?

1. **Validación temprana**: Se verifica en frontend y backend
2. **Persistencia atómica**: Mensaje se guarda antes de enviar
3. **Broadcast eficiente**: Solo a usuarios en la sala
4. **Estado consistente**: Todos los clientes ven el mismo mensaje
5. **Recuperación**: Mensajes persisten si un usuario se desconecta

---

## 🎯 Decisiones de Arquitectura Clave

### **¿Por qué Redis sobre PostgreSQL/MongoDB?**

**Ventajas de Redis:**
- ✅ **Velocidad**: Operaciones en memoria son ~100x más rápidas
- ✅ **TTL nativo**: Limpieza automática de mensajes antiguos
- ✅ **Estructuras de datos ricas**: Lists, Sets, Hashes optimizados
- ✅ **Pub/Sub**: Perfecto para chat en tiempo real
- ✅ **Simplicidad**: Sin esquemas complejos ni migraciones

**Desventajas:**
- ❌ **Memoria limitada**: Más costoso que disco
- ❌ **Durabilidad**: Datos pueden perderse en crash
- ❌ **Consultas limitadas**: No SQL complejo

### **¿Por qué Socket.io sobre WebSockets nativos?**

**Ventajas de Socket.io:**
- ✅ **Fallbacks**: HTTP long-polling si WebSockets fallan
- ✅ **Reconexión automática**: Maneja desconexiones de red
- ✅ **Rooms**: Agrupación nativa de clientes
- ✅ **Cross-browser**: Funciona en navegadores antiguos
- ✅ **Middlewares**: Autenticación y rate limiting fáciles

### **¿Por qué Arquitectura de Servicios?**

```
Models (Datos) ←→ Services (Lógica) ←→ Handlers/Routes (Comunicación)
```

**Ventajas:**
- ✅ **Separación de responsabilidades**
- ✅ **Testeable**: Cada capa se puede testear independientemente  
- ✅ **Reutilizable**: Services usados por REST y WebSockets
- ✅ **Mantenible**: Cambios localizados por capa

---

## 🚀 Cómo Ejecutar el Proyecto

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd pruebas_redis

# 2. Instalar dependencias
npm install

# 3. Instalar y iniciar Redis
brew install redis
brew services start redis

# 4. Verificar Redis
redis-cli ping  # Debe responder PONG

# 5. Iniciar servidor
npm run dev     # Desarrollo con nodemon
# o
npm start       # Producción

# 6. Abrir navegador
open http://localhost:3000
```

## 🧪 Pruebas de Funcionalidad

1. **Abrir múltiples pestañas** en http://localhost:3000
2. **Crear usuario** en cada pestaña con nombres diferentes
3. **Crear sala** desde una pestaña
4. **Unirse a la sala** desde todas las pestañas
5. **Enviar mensajes** y ver que aparecen en tiempo real
6. **Cerrar una pestaña** y ver mensaje "Usuario salió"
7. **Probar indicador de escritura** escribiendo sin enviar

---

> 💡 **Próximos pasos**: Autenticación JWT, mensajes multimedia, notificaciones push, moderación automática, logs de auditoría.