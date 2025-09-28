# Chat Backend con Redis

Un backend completo para chat en tiempo real utilizando Node.js, Express, Socket.io y Redis como base de datos.

## 🚀 Características

- **Chat en tiempo real** con Socket.io
- **Persistencia de datos** con Redis
- **Salas de chat** públicas y privadas
- **Gestión de usuarios** online/offline
- **API REST** para gestión de salas y mensajes
- **Interfaz web** de demostración incluida
- **Indicadores de escritura** en tiempo real
- **Mensajes del sistema** para eventos
- **Validación de datos** con Joi
- **Rate limiting** básico

## 📁 Estructura del Proyecto

```
├── config/              # Configuración (Redis)
├── models/              # Modelos de datos (Message, User, Room)
├── services/            # Servicios de negocio (MessageService, UserService, RoomService)
├── handlers/            # Handlers de Socket.io
├── routes/              # Rutas REST API
├── utils/               # Utilidades y validadores
├── public/              # Interfaz web de demo
├── server.js            # Servidor principal
├── package.json         # Dependencias
└── .env                 # Variables de entorno
```

## 🛠️ Instalación

1. **Clonar el repositorio**
```bash
git clone <tu-repo>
cd # Chat Backend con Redis, Express y Socket.io

Un sistema de chat en tiempo real construido con Node.js, Express, Socket.io y Redis como base de datos.

## 🚀 Características

- **Chat en tiempo real** con Socket.io
- **Múltiples salas de chat**
- **Persistencia de mensajes** en Redis
- **Gestión de usuarios** y estado online/offline
- **API REST** para gestión de salas y mensajes
- **Interfaz web** simple para pruebas
- **Indicadores de escritura** en tiempo real
- **Validación** de datos y sanitización
- **Manejo de errores** robusto

## 🏗️ Arquitectura del Proyecto

```
pruebas_redis/
├── config/
│   └── redis.js              # Configuración de Redis
├── models/
│   ├── Message.js            # Modelo de mensajes
│   ├── User.js               # Modelo de usuarios
│   └── Room.js               # Modelo de salas
├── services/
│   ├── MessageService.js     # Servicio para mensajes
│   ├── UserService.js        # Servicio para usuarios
│   └── RoomService.js        # Servicio para salas
├── handlers/
│   └── chatHandlers.js       # Manejadores de Socket.io
├── routes/
│   ├── messageRoutes.js      # Rutas REST para mensajes
│   └── roomRoutes.js         # Rutas REST para salas
├── utils/
│   └── validators.js         # Validadores y utilidades
├── public/
│   ├── index.html           # Interfaz web del chat
│   └── chat.js              # Cliente JavaScript
├── server.js                # Servidor principal
├── package.json             # Dependencias y scripts
├── .env                     # Variables de entorno
└── .gitignore              # Archivos ignorados por Git
```

## 📋 Prerequisitos

- Node.js 16 o superior
- Redis Server
- npm o yarn

## 🔧 Instalación

### 1. Instalar Redis

En macOS con Homebrew:
```bash
brew install redis
brew services start redis
```

En Ubuntu/Debian:
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

### 2. Clonar e instalar dependencias

```bash
git clone <tu-repositorio>
cd pruebas_redis
npm install
```

### 3. Configurar variables de entorno

Copia el archivo `.env` y ajusta los valores según tu configuración:

```bash
PORT=3000
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
NODE_ENV=development
MAX_MESSAGE_LENGTH=500
MAX_USERS_PER_ROOM=50
MESSAGE_RETENTION_DAYS=7
```

### 4. Iniciar el servidor

```bash
# Desarrollo con auto-reload
npm run dev

# Producción
npm start
```

## 🧪 Uso

### Interfaz Web

Abre tu navegador en `http://localhost:3000` para acceder a la interfaz de chat.

### API REST

#### Salas

- `GET /api/rooms` - Obtener todas las salas públicas
- `GET /api/rooms/:roomId` - Obtener información de una sala
- `POST /api/rooms` - Crear nueva sala
- `PUT /api/rooms/:roomId` - Actualizar sala
- `DELETE /api/rooms/:roomId` - Eliminar sala
- `GET /api/rooms/:roomId/users` - Obtener usuarios de una sala

#### Mensajes

- `GET /api/messages/room/:roomId` - Obtener mensajes de una sala
- `GET /api/messages/:messageId` - Obtener mensaje específico
- `DELETE /api/messages/:messageId` - Eliminar mensaje

### Socket.io Events

#### Cliente → Servidor

- `user:join` - Unirse al chat con username
- `room:join` - Unirse a una sala específica
- `message:send` - Enviar mensaje
- `typing:start` - Comenzar a escribir
- `typing:stop` - Parar de escribir
- `room:leave` - Salir de sala actual

#### Servidor → Cliente

- `user:joined` - Confirmación de conexión
- `room:joined` - Confirmación de unión a sala
- `message:new` - Nuevo mensaje recibido
- `user:entered` - Usuario entró a la sala
- `user:left` - Usuario salió de la sala
- `user:typing` - Usuario está escribiendo
- `user:stopped_typing` - Usuario paró de escribir
- `error` - Error del servidor

## 🗄️ Estructura de Datos en Redis

### Mensajes
```
chat:messages:{messageId} -> Hash con datos del mensaje
chat:room_messages:{roomId} -> Lista de IDs de mensajes por sala
```

### Usuarios
```
chat:users:{userId} -> Hash con datos del usuario
chat:room_users:{roomId} -> Set de IDs de usuarios por sala
chat:socket_users:{socketId} -> Mapeo socketId → userId
```

### Salas
```
chat:rooms:{roomId} -> Hash con datos de la sala
chat:rooms_list -> Set con todos los IDs de salas
```

## ⚙️ Funcionalidades Detalladas

### 1. Gestión de Conexiones
- Autenticación por username
- Mapeo socket ↔ usuario
- Cleanup automático al desconectar

### 2. Salas de Chat
- Creación dinámica de salas
- Límite de usuarios por sala
- Salas públicas y privadas
- Contador de usuarios en tiempo real

### 3. Mensajes
- Persistencia en Redis con TTL
- Historial limitado (últimos 1000 mensajes)
- Mensajes del sistema (unirse/salir)
- Validación de contenido

### 4. Estados en Tiempo Real
- Usuarios online/offline
- Indicadores de escritura
- Notificaciones de entrada/salida

## 🛡️ Seguridad

- Validación de entrada con Joi
- Sanitización de HTML
- Rate limiting básico
- Límites de longitud de mensajes
- TTL para limpiar datos antiguos

## 🚀 Despliegue

### Usando Docker (próximamente)

```dockerfile
# Dockerfile básico
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Variables de Entorno en Producción

```bash
NODE_ENV=production
PORT=3000
REDIS_HOST=tu-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=tu-password-seguro
```

## 🧪 Testing

```bash
# Ejecutar tests
npm test

# Tests con cobertura
npm run test:coverage
```

## 📈 Monitoreo

### Health Check
```bash
curl http://localhost:3000/health
```

### Redis Status
```bash
redis-cli ping
redis-cli info stats
```

## 🔧 Desarrollo

### Scripts Disponibles

- `npm start` - Iniciar servidor de producción
- `npm run dev` - Desarrollo con nodemon
- `npm test` - Ejecutar tests

### Estructura de Commits

- `feat:` - Nueva funcionalidad
- `fix:` - Corrección de bugs
- `docs:` - Documentación
- `refactor:` - Refactorización
- `test:` - Tests

## 📝 TODO / Mejoras Futuras

- [ ] Autenticación JWT
- [ ] Salas privadas con contraseña
- [ ] Envío de archivos/imágenes
- [ ] Emojis y reacciones
- [ ] Mensajes privados
- [ ] Moderación avanzada
- [ ] Dashboard de administración
- [ ] Tests unitarios e integración
- [ ] Docker compose con Redis
- [ ] Métricas y logging avanzado

## 🤝 Contribuciones

1. Fork el proyecto
2. Crea tu rama de feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 🙏 Agradecimientos

- Socket.io por la comunicación en tiempo real
- Redis por la persistencia eficiente
- Express.js por el framework web
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar Redis**
   - Instalar Redis localmente o usar Docker:
   ```bash
   # Con Docker
   docker run -d -p 6379:6379 redis:alpine
   
   # O instalar localmente (macOS con Homebrew)
   brew install redis
   brew services start redis
   ```

4. **Configurar variables de entorno**
   - El archivo `.env` ya está configurado para desarrollo local
   - Modifica las variables según tu configuración:
   ```env
   PORT=3000
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   ```

## 🚦 Uso

### Iniciar el servidor

```bash
# Desarrollo (con nodemon)
npm run dev

# Producción
npm start
```

El servidor estará disponible en `http://localhost:3000`

### Probar el chat

1. Ve a `http://localhost:3000` en tu navegador
2. Ingresa tu nombre de usuario
3. Crea una nueva sala o únete a una existente
4. ¡Comienza a chatear!

## 📡 API REST

### Salas

- `GET /api/rooms` - Obtener todas las salas públicas
- `GET /api/rooms/:roomId` - Obtener información de una sala
- `POST /api/rooms` - Crear nueva sala
- `PUT /api/rooms/:roomId` - Actualizar sala
- `DELETE /api/rooms/:roomId` - Eliminar sala
- `GET /api/rooms/:roomId/users` - Obtener usuarios de una sala

### Mensajes

- `GET /api/messages/room/:roomId` - Obtener mensajes de una sala
- `GET /api/messages/:messageId` - Obtener mensaje específico
- `DELETE /api/messages/:messageId` - Eliminar mensaje

### Salud del sistema

- `GET /health` - Estado del servidor y conexión Redis

## 🔌 Eventos Socket.io

### Cliente → Servidor

- `user:join` - Unirse al chat con nombre de usuario
- `room:join` - Unirse a una sala
- `room:leave` - Salir de una sala
- `message:send` - Enviar mensaje
- `typing:start` - Comenzar a escribir
- `typing:stop` - Parar de escribir

### Servidor → Cliente

- `user:joined` - Confirmación de conexión
- `room:joined` - Confirmación de unión a sala
- `message:new` - Nuevo mensaje recibido
- `user:entered` - Usuario entró a la sala
- `user:left` - Usuario salió de la sala
- `user:typing` - Usuario está escribiendo
- `user:stopped_typing` - Usuario paró de escribir
- `error` - Error del servidor

## 💾 Estructura de Datos en Redis

### Usuarios
- `chat:users:{userId}` - Hash con datos del usuario
- `chat:socket_users:{socketId}` - Mapeo socket → userId
- `chat:room_users:{roomId}` - Set de usuarios en la sala

### Mensajes
- `chat:messages:{messageId}` - Hash con datos del mensaje
- `chat:room_messages:{roomId}` - Lista de IDs de mensajes de la sala

### Salas
- `chat:rooms:{roomId}` - Hash con datos de la sala
- `chat:rooms_list` - Set con IDs de todas las salas

## 🧪 Testing

```bash
npm test
```

## 🐳 Docker (Opcional)

Crear archivo `docker-compose.yml`:

```yaml
version: '3.8'
services:
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    
  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - redis
    environment:
      - REDIS_HOST=redis
```

## 🔧 Configuración Avanzada

### Variables de Entorno

- `PORT` - Puerto del servidor (por defecto: 3000)
- `REDIS_HOST` - Host de Redis (por defecto: localhost)
- `REDIS_PORT` - Puerto de Redis (por defecto: 6379)
- `REDIS_PASSWORD` - Contraseña de Redis (opcional)
- `MAX_MESSAGE_LENGTH` - Longitud máxima de mensaje (por defecto: 500)
- `MAX_USERS_PER_ROOM` - Usuarios máximos por sala (por defecto: 50)
- `MESSAGE_RETENTION_DAYS` - Días de retención de mensajes (por defecto: 7)

## 🔒 Seguridad

- Validación de entrada con Joi
- Sanitización de HTML
- Rate limiting básico
- TTL para datos temporales
- Validación de permisos básica

## 🚀 Próximas Mejoras

- [ ] Autenticación JWT
- [ ] Salas privadas con contraseña
- [ ] Envío de archivos/imágenes
- [ ] Notificaciones push
- [ ] Moderación de chat
- [ ] Temas/apariencia personalizable
- [ ] Emojis y reacciones
- [ ] Historial de mensajes paginado
- [ ] WebRTC para videollamadas

## 📄 Licencia

MIT

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request