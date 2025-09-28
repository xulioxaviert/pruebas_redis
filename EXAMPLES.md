# 📖 Ejemplos de Uso y Casos Prácticos

## 🎯 Casos de Uso Comunes

### 1. **Flujo Completo: Usuario Nuevo**

```javascript
// === PASO 1: Conectar al servidor ===
const socket = io('http://localhost:3000');

// Escuchar evento de conexión
socket.on('connect', () => {
    console.log('Conectado al servidor');
});

// === PASO 2: Autenticarse ===
socket.emit('user:join', { 
    username: 'Juan Pérez' 
});

// Confirmar autenticación exitosa
socket.on('user:joined', (data) => {
    console.log('Usuario autenticado:', data);
    // { userId: "abc-123", username: "Juan Pérez", message: "Conectado exitosamente" }
});

// === PASO 3: Crear una sala nueva ===
fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        name: 'Developers Madrid',
        description: 'Sala para desarrolladores de Madrid',
        createdBy: data.userId,
        maxUsers: 25
    })
});

// === PASO 4: Unirse a la sala ===
socket.emit('room:join', { 
    roomId: 'room-abc-123' 
});

// Confirmar unión exitosa
socket.on('room:joined', (roomData) => {
    console.log('En la sala:', roomData.roomName);
    console.log('Usuarios conectados:', roomData.users.length);
    console.log('Mensajes recientes:', roomData.messages);
});

// === PASO 5: Enviar mensajes ===
socket.emit('message:send', { 
    content: '¡Hola a todos! Soy nuevo aquí 👋' 
});
```

---

### 2. **Sistema de Notificaciones en Tiempo Real**

```javascript
class ChatNotifications {
    constructor(socket) {
        this.socket = socket;
        this.setupListeners();
    }

    setupListeners() {
        // Nuevo mensaje recibido
        this.socket.on('message:new', (message) => {
            this.showNotification(message);
            this.playSound();
            this.updateUnreadCount();
        });

        // Usuario entra a la sala
        this.socket.on('user:entered', (data) => {
            this.showToast(`${data.username} se unió a la sala`);
            this.updateUserCount(data.userCount);
        });

        // Usuario sale de la sala
        this.socket.on('user:left', (data) => {
            this.showToast(`${data.username} salió de la sala`);
            this.updateUserCount(data.userCount);
        });

        // Alguien está escribiendo
        this.socket.on('user:typing', (data) => {
            this.showTypingIndicator(`${data.username} está escribiendo...`);
        });

        this.socket.on('user:stopped_typing', () => {
            this.hideTypingIndicator();
        });
    }

    showNotification(message) {
        // Solo notificar si no es mensaje propio
        if (message.userId !== currentUserId) {
            new Notification(`${message.username}`, {
                body: message.content,
                icon: '/chat-icon.png'
            });
        }
    }

    playSound() {
        const audio = new Audio('/notification.mp3');
        audio.play().catch(console.error);
    }
}

// Uso
const notifications = new ChatNotifications(socket);
```

---

### 3. **Manejo de Reconexión Automática**

```javascript
class ChatConnection {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.currentUser = null;
        this.currentRoom = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        this.connect();
    }

    connect() {
        this.socket = io(this.serverUrl, {
            // Configuración de reconexión
            reconnection: true,
            reconnectionDelay: 1000,        // 1 segundo
            reconnectionDelayMax: 5000,     // Máximo 5 segundos
            maxReconnectionAttempts: this.maxReconnectAttempts
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Conexión exitosa
        this.socket.on('connect', () => {
            console.log('✅ Conectado al servidor');
            this.reconnectAttempts = 0;
            
            // Re-autenticar si teníamos usuario
            if (this.currentUser) {
                this.rejoinUser();
            }
        });

        // Desconexión
        this.socket.on('disconnect', (reason) => {
            console.log('❌ Desconectado:', reason);
            this.showConnectionStatus('Desconectado - Intentando reconectar...');
        });

        // Intentando reconectar
        this.socket.on('reconnecting', (attemptNumber) => {
            console.log(`🔄 Intento de reconexión ${attemptNumber}/${this.maxReconnectAttempts}`);
            this.showConnectionStatus(`Reconectando... (${attemptNumber}/${this.maxReconnectAttempts})`);
        });

        // Reconexión exitosa
        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`✅ Reconectado después de ${attemptNumber} intentos`);
            this.showConnectionStatus('Conectado');
        });

        // Falló la reconexión
        this.socket.on('reconnect_failed', () => {
            console.log('❌ Falló la reconexión después de múltiples intentos');
            this.showConnectionStatus('Conexión perdida - Refresh la página');
        });
    }

    async rejoinUser() {
        // Re-autenticar
        this.socket.emit('user:join', { 
            username: this.currentUser.username 
        });

        // Re-unirse a la sala si estaba en una
        if (this.currentRoom) {
            this.socket.emit('room:join', { 
                roomId: this.currentRoom.id 
            });
        }
    }

    showConnectionStatus(message) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }
}

// Uso
const chatConnection = new ChatConnection('http://localhost:3000');
```

---

### 4. **Sistema de Moderación Básica**

```javascript
class ChatModerator {
    constructor(socket, userRole) {
        this.socket = socket;
        this.userRole = userRole; // 'user', 'moderator', 'admin'
        this.bannedWords = ['spam', 'malware', 'phishing'];
        this.rateLimitMap = new Map(); // userId -> timestamp[]
    }

    // Validar mensaje antes de enviar
    validateMessage(content) {
        const errors = [];

        // Validar longitud
        if (content.length > 500) {
            errors.push('Mensaje muy largo (máximo 500 caracteres)');
        }

        // Validar palabras prohibidas
        const lowerContent = content.toLowerCase();
        const foundBannedWord = this.bannedWords.find(word => 
            lowerContent.includes(word)
        );
        if (foundBannedWord) {
            errors.push(`Contenido no permitido: "${foundBannedWord}"`);
        }

        // Validar rate limiting (máximo 5 mensajes por minuto)
        if (this.isRateLimited(currentUserId)) {
            errors.push('Estás enviando mensajes muy rápido. Espera un momento.');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    isRateLimited(userId) {
        const now = Date.now();
        const userTimestamps = this.rateLimitMap.get(userId) || [];
        
        // Filtrar timestamps de último minuto
        const recentTimestamps = userTimestamps.filter(
            timestamp => now - timestamp < 60000 // 60 segundos
        );

        // Actualizar el map
        this.rateLimitMap.set(userId, recentTimestamps);

        // Verificar límite
        return recentTimestamps.length >= 5;
    }

    recordMessage(userId) {
        const now = Date.now();
        const userTimestamps = this.rateLimitMap.get(userId) || [];
        userTimestamps.push(now);
        this.rateLimitMap.set(userId, userTimestamps);
    }

    // Funciones de moderador
    deleteMessage(messageId) {
        if (this.userRole !== 'moderator' && this.userRole !== 'admin') {
            throw new Error('Sin permisos de moderador');
        }

        fetch(`/api/messages/${messageId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
    }

    kickUser(userId, roomId) {
        if (this.userRole !== 'admin') {
            throw new Error('Sin permisos de administrador');
        }

        this.socket.emit('admin:kick_user', { 
            userId, 
            roomId,
            reason: 'Violación de normas'
        });
    }
}

// Integración con envío de mensajes
function sendMessage(content) {
    const validation = moderator.validateMessage(content);
    
    if (!validation.isValid) {
        showError(validation.errors.join(', '));
        return;
    }

    socket.emit('message:send', { content });
    moderator.recordMessage(currentUserId);
}
```

---

### 5. **Dashboard de Administración**

```javascript
class ChatDashboard {
    constructor() {
        this.stats = {
            totalUsers: 0,
            activeUsers: 0,
            totalRooms: 0,
            totalMessages: 0
        };
        
        this.init();
    }

    async init() {
        await this.loadStats();
        this.setupRealTimeUpdates();
        this.renderDashboard();
    }

    async loadStats() {
        try {
            // Obtener estadísticas del servidor
            const response = await fetch('/api/admin/stats');
            this.stats = await response.json();
        } catch (error) {
            console.error('Error cargando estadísticas:', error);
        }
    }

    setupRealTimeUpdates() {
        const adminSocket = io('/admin', {
            auth: { token: adminToken }
        });

        adminSocket.on('stats:update', (newStats) => {
            this.stats = { ...this.stats, ...newStats };
            this.updateStatsDisplay();
        });

        adminSocket.on('user:activity', (activity) => {
            this.logActivity(activity);
        });
    }

    renderDashboard() {
        const dashboard = document.getElementById('admin-dashboard');
        dashboard.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>Usuarios Totales</h3>
                    <span class="stat-number">${this.stats.totalUsers}</span>
                </div>
                <div class="stat-card">
                    <h3>Usuarios Activos</h3>
                    <span class="stat-number">${this.stats.activeUsers}</span>
                </div>
                <div class="stat-card">
                    <h3>Salas Totales</h3>
                    <span class="stat-number">${this.stats.totalRooms}</span>
                </div>
                <div class="stat-card">
                    <h3>Mensajes Hoy</h3>
                    <span class="stat-number">${this.stats.totalMessages}</span>
                </div>
            </div>
            
            <div class="recent-activity">
                <h3>Actividad Reciente</h3>
                <div id="activity-log"></div>
            </div>
            
            <div class="room-management">
                <h3>Gestión de Salas</h3>
                <div id="rooms-list"></div>
            </div>
        `;
    }

    logActivity(activity) {
        const log = document.getElementById('activity-log');
        const entry = document.createElement('div');
        entry.className = 'activity-entry';
        entry.innerHTML = `
            <span class="timestamp">${new Date(activity.timestamp).toLocaleTimeString()}</span>
            <span class="user">${activity.username}</span>
            <span class="action">${activity.action}</span>
            <span class="room">${activity.roomName}</span>
        `;
        log.prepend(entry);

        // Mantener solo últimas 50 entradas
        while (log.children.length > 50) {
            log.removeChild(log.lastChild);
        }
    }
}

// Uso
const dashboard = new ChatDashboard();
```

---

### 6. **Cliente de Chat Móvil (Progressive Web App)**

```javascript
class MobileChatApp {
    constructor() {
        this.isOnline = navigator.onLine;
        this.pendingMessages = []; // Cola para mensajes offline
        this.init();
    }

    init() {
        this.registerServiceWorker();
        this.setupOfflineHandling();
        this.setupPushNotifications();
        this.setupMobileUI();
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('ServiceWorker registrado:', registration);
            } catch (error) {
                console.error('Error registrando ServiceWorker:', error);
            }
        }
    }

    setupOfflineHandling() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.showConnectionStatus('Conectado');
            this.flushPendingMessages();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showConnectionStatus('Sin conexión - Los mensajes se enviarán cuando vuelvas a estar online');
        });
    }

    async setupPushNotifications() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('Notificaciones push habilitadas');
            }
        }
    }

    setupMobileUI() {
        // Configuración específica para móviles
        const viewport = document.querySelector('meta[name=viewport]');
        viewport.setAttribute('content', 
            'width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover'
        );

        // Ocultar barra de direcciones en iOS
        window.addEventListener('scroll', () => {
            if (window.pageYOffset === 0) {
                window.scrollTo(0, 1);
            }
        });

        // Manejar teclado virtual
        window.addEventListener('resize', () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        });
    }

    sendMessage(content) {
        if (this.isOnline) {
            socket.emit('message:send', { content });
        } else {
            // Guardar mensaje para enviar cuando vuelva la conexión
            this.pendingMessages.push({
                content,
                timestamp: new Date().toISOString(),
                id: `pending_${Date.now()}`
            });
            
            this.showPendingMessage(content);
        }
    }

    flushPendingMessages() {
        while (this.pendingMessages.length > 0) {
            const message = this.pendingMessages.shift();
            socket.emit('message:send', { content: message.content });
        }
    }

    showPendingMessage(content) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message own pending';
        messageElement.innerHTML = `
            <div class="message-content">${content}</div>
            <div class="message-status">Enviando...</div>
        `;
        document.getElementById('messages-container').appendChild(messageElement);
    }
}

// Uso
const mobileApp = new MobileChatApp();
```

---

## 🔧 Configuraciones Avanzadas

### 1. **Configuración de Producción**

```javascript
// config/production.js
module.exports = {
    redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD,
        // Configuración de cluster
        cluster: {
            enableOfflineQueue: false,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3
        }
    },
    
    socketio: {
        // Configuración para múltiples instancias
        adapter: 'redis',
        cors: {
            origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
            credentials: true
        },
        // Rate limiting
        rateLimit: {
            max: 100, // mensajes por minuto
            windowMs: 60000
        }
    },

    chat: {
        messageRetentionDays: 30,
        maxRoomsPerUser: 5,
        maxUsersPerRoom: 100,
        maxMessageLength: 1000
    }
};
```

### 2. **Monitoreo y Logs**

```javascript
// utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Métricas de chat
class ChatMetrics {
    constructor(logger) {
        this.logger = logger;
        this.metrics = {
            messagesPerMinute: 0,
            activeUsers: 0,
            activeRooms: 0,
            errorRate: 0
        };
    }

    logUserJoin(userId, username) {
        this.logger.info('User joined', {
            userId,
            username,
            timestamp: new Date().toISOString(),
            event: 'user_join'
        });
    }

    logMessage(userId, roomId, messageLength) {
        this.logger.info('Message sent', {
            userId,
            roomId,
            messageLength,
            timestamp: new Date().toISOString(),
            event: 'message_sent'
        });
        
        this.metrics.messagesPerMinute++;
    }

    logError(error, context) {
        this.logger.error('Chat error', {
            error: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString(),
            event: 'error'
        });
        
        this.metrics.errorRate++;
    }
}

module.exports = { logger, ChatMetrics };
```

---

## 🧪 Testing Avanzado

### 1. **Tests de Integración con Redis**

```javascript
// tests/integration/chat.test.js
const { createClient } = require('redis');
const { GenericContainer } = require('testcontainers');
const io = require('socket.io-client');
const app = require('../../server');

describe('Chat Integration Tests', () => {
    let redisContainer;
    let redisClient;
    let server;
    let clientSocket;

    beforeAll(async () => {
        // Iniciar contenedor Redis para tests
        redisContainer = await new GenericContainer('redis:7-alpine')
            .withExposedPorts(6379)
            .start();

        const redisPort = redisContainer.getMappedPort(6379);
        const redisHost = redisContainer.getHost();

        // Configurar cliente Redis de test
        redisClient = createClient({
            url: `redis://${redisHost}:${redisPort}`
        });
        await redisClient.connect();

        // Iniciar servidor con Redis de test
        process.env.REDIS_HOST = redisHost;
        process.env.REDIS_PORT = redisPort;
        server = app.listen(3001);
    });

    afterAll(async () => {
        await redisClient.quit();
        await redisContainer.stop();
        server.close();
    });

    beforeEach(async () => {
        // Limpiar Redis antes de cada test
        await redisClient.flushAll();
        
        clientSocket = io('http://localhost:3001');
        await new Promise(resolve => clientSocket.on('connect', resolve));
    });

    afterEach(() => {
        clientSocket.close();
    });

    test('Usuario puede unirse y enviar mensaje', async () => {
        // Test del flujo completo
        const username = 'TestUser';
        const roomId = 'test-room';
        const messageContent = 'Hello World!';

        // 1. Crear sala
        const roomResponse = await fetch('http://localhost:3001/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Room',
                createdBy: 'test-user-id'
            })
        });
        const { data: room } = await roomResponse.json();

        // 2. Usuario se une
        clientSocket.emit('user:join', { username });
        const userJoined = await new Promise(resolve => 
            clientSocket.on('user:joined', resolve)
        );

        expect(userJoined.username).toBe(username);

        // 3. Usuario se une a la sala
        clientSocket.emit('room:join', { roomId: room.id });
        const roomJoined = await new Promise(resolve =>
            clientSocket.on('room:joined', resolve)
        );

        expect(roomJoined.roomId).toBe(room.id);

        // 4. Usuario envía mensaje
        clientSocket.emit('message:send', { content: messageContent });
        const messageReceived = await new Promise(resolve =>
            clientSocket.on('message:new', resolve)
        );

        expect(messageReceived.content).toBe(messageContent);
        expect(messageReceived.username).toBe(username);

        // 5. Verificar persistencia en Redis
        const messageKey = `chat:messages:${messageReceived.id}`;
        const savedMessage = await redisClient.hGetAll(messageKey);
        expect(savedMessage.content).toBe(messageContent);
    });

    test('Rate limiting funciona correctamente', async () => {
        clientSocket.emit('user:join', { username: 'SpamUser' });
        await new Promise(resolve => clientSocket.on('user:joined', resolve));

        // Crear sala y unirse
        const roomResponse = await fetch('http://localhost:3001/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Spam Test Room',
                createdBy: 'spam-user-id'
            })
        });
        const { data: room } = await roomResponse.json();

        clientSocket.emit('room:join', { roomId: room.id });
        await new Promise(resolve => clientSocket.on('room:joined', resolve));

        // Enviar muchos mensajes rápidamente
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(new Promise(resolve => {
                clientSocket.emit('message:send', { content: `Spam message ${i}` });
                clientSocket.once('error', resolve);
                clientSocket.once('message:new', resolve);
            }));
        }

        const results = await Promise.all(promises);
        const errors = results.filter(result => result.message?.includes('rápido'));
        
        expect(errors.length).toBeGreaterThan(0);
    });
});
```

### 2. **Tests de Carga**

```javascript
// tests/load/chat-load.test.js
const io = require('socket.io-client');

describe('Chat Load Tests', () => {
    test('100 usuarios concurrentes', async () => {
        const userCount = 100;
        const clients = [];
        const messages = [];

        // Crear 100 clientes
        for (let i = 0; i < userCount; i++) {
            const client = io('http://localhost:3000');
            clients.push(client);

            client.on('connect', () => {
                client.emit('user:join', { username: `User${i}` });
            });

            client.on('message:new', (message) => {
                messages.push(message);
            });
        }

        // Esperar conexión de todos
        await new Promise(resolve => {
            let connectedCount = 0;
            clients.forEach(client => {
                client.on('user:joined', () => {
                    connectedCount++;
                    if (connectedCount === userCount) {
                        resolve();
                    }
                });
            });
        });

        // Todos se unen a la misma sala
        const startTime = Date.now();
        clients.forEach(client => {
            client.emit('room:join', { roomId: 'load-test-room' });
        });

        // Esperar que todos se unan
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Cada cliente envía un mensaje
        clients.forEach((client, index) => {
            client.emit('message:send', { 
                content: `Message from User${index}` 
            });
        });

        // Esperar que se procesen todos los mensajes
        await new Promise(resolve => setTimeout(resolve, 3000));

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`Test completado en ${duration}ms`);
        console.log(`Mensajes recibidos: ${messages.length}`);
        console.log(`Promedio: ${duration / userCount}ms por usuario`);

        // Verificar que se recibieron todos los mensajes
        expect(messages.length).toBeGreaterThan(userCount * 0.95); // 95% success rate

        // Limpiar
        clients.forEach(client => client.close());
    }, 30000); // Timeout de 30 segundos
});
```

---

> 💡 **Tip**: Estos ejemplos cubren casos reales que encontrarás al implementar un sistema de chat en producción. Cada uno puede adaptarse según tus necesidades específicas.

> 🚀 **Próximos pasos**: Implementar autenticación JWT, mensajes multimedia, notificaciones push, y moderación automática con AI.