# API Examples - Chat Backend

Este documento contiene ejemplos prácticos de cómo usar la API del chat backend.

## 🚀 Iniciando el Servidor

```bash
# 1. Asegúrate de que Redis esté corriendo
redis-server
# o
brew services start redis

# 2. Instalar dependencias
npm install

# 3. Iniciar servidor en desarrollo
npm run dev

# 4. El servidor estará disponible en http://localhost:3000
```

## 🔌 Usando Socket.io (Cliente JavaScript)

### Conexión Básica

```javascript
// Conectar al servidor
const socket = io('http://localhost:3000');

// Eventos de conexión
socket.on('connect', () => {
    console.log('Conectado:', socket.id);
});

socket.on('disconnect', () => {
    console.log('Desconectado');
});
```

### Flujo Completo de Chat

```javascript
// 1. Unirse al chat
socket.emit('user:join', { 
    username: 'Juan123' 
});

socket.on('user:joined', (data) => {
    console.log('Usuario conectado:', data);
    // { userId: 'uuid', username: 'Juan123', message: 'Conectado exitosamente' }
});

// 2. Unirse a una sala
socket.emit('room:join', { 
    roomId: 'sala-general-uuid' 
});

socket.on('room:joined', (data) => {
    console.log('Unido a sala:', data);
    /*
    {
        roomId: 'uuid',
        roomName: 'Sala General',
        users: [{ id: 'uuid', username: 'Juan123', isOnline: true }],
        messages: [...],
        userCount: 5
    }
    */
});

// 3. Enviar mensaje
socket.emit('message:send', { 
    content: '¡Hola a todos!' 
});

// 4. Recibir mensajes
socket.on('message:new', (message) => {
    console.log('Nuevo mensaje:', message);
    /*
    {
        id: 'uuid',
        roomId: 'uuid',
        userId: 'uuid',
        username: 'Juan123',
        content: '¡Hola a todos!',
        timestamp: '2023-10-15T10:30:00.000Z',
        type: 'text'
    }
    */
});

// 5. Indicadores de escritura
socket.emit('typing:start');
setTimeout(() => {
    socket.emit('typing:stop');
}, 1000);

socket.on('user:typing', (data) => {
    console.log(`${data.username} está escribiendo...`);
});
```

## 🛣️ API REST Examples

### Gestión de Salas

#### Obtener todas las salas públicas

```bash
curl -X GET http://localhost:3000/api/rooms
```

```javascript
// Response
{
    "success": true,
    "data": [
        {
            "id": "uuid-1",
            "name": "Sala General",
            "description": "Sala principal de chat",
            "createdAt": "2023-10-15T10:00:00.000Z",
            "createdBy": "admin-uuid",
            "isPrivate": false,
            "maxUsers": 50,
            "userCount": 12,
            "isFull": false
        },
        {
            "id": "uuid-2",
            "name": "Desarrollo Web",
            "description": "Hablemos de código",
            "createdAt": "2023-10-15T11:00:00.000Z",
            "createdBy": "user-uuid",
            "isPrivate": false,
            "maxUsers": 25,
            "userCount": 8,
            "isFull": false
        }
    ]
}
```

#### Crear nueva sala

```bash
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mi Nueva Sala",
    "description": "Una sala para mis amigos",
    "isPrivate": false,
    "maxUsers": 20,
    "createdBy": "mi-usuario-uuid"
  }'
```

```javascript
// Response
{
    "success": true,
    "data": {
        "id": "nuevo-uuid",
        "name": "Mi Nueva Sala",
        "description": "Una sala para mis amigos",
        "createdAt": "2023-10-15T12:00:00.000Z",
        "createdBy": "mi-usuario-uuid",
        "isPrivate": false,
        "maxUsers": 20,
        "userCount": 0
    },
    "message": "Sala creada exitosamente"
}
```

#### Obtener información detallada de una sala

```bash
curl -X GET http://localhost:3000/api/rooms/uuid-de-la-sala
```

```javascript
// Response
{
    "success": true,
    "data": {
        "id": "uuid-de-la-sala",
        "name": "Sala General",
        "description": "Sala principal",
        "createdAt": "2023-10-15T10:00:00.000Z",
        "createdBy": "admin-uuid",
        "isPrivate": false,
        "maxUsers": 50,
        "users": [
            {
                "id": "user-1",
                "username": "Juan123",
                "isOnline": true,
                "joinedAt": "2023-10-15T10:30:00.000Z"
            },
            {
                "id": "user-2",
                "username": "Maria456",
                "isOnline": false,
                "joinedAt": "2023-10-15T10:45:00.000Z"
            }
        ],
        "userCount": 12,
        "isFull": false
    }
}
```

#### Actualizar sala

```bash
curl -X PUT http://localhost:3000/api/rooms/uuid-de-la-sala \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sala General Actualizada",
    "description": "Nueva descripción",
    "maxUsers": 75
  }'
```

#### Eliminar sala

```bash
curl -X DELETE http://localhost:3000/api/rooms/uuid-de-la-sala
```

#### Obtener usuarios de una sala

```bash
curl -X GET http://localhost:3000/api/rooms/uuid-de-la-sala/users
```

### Gestión de Mensajes

#### Obtener mensajes de una sala (con paginación)

```bash
# Primeros 20 mensajes
curl -X GET "http://localhost:3000/api/messages/room/uuid-de-la-sala?limit=20&offset=0"

# Siguientes 20 mensajes
curl -X GET "http://localhost:3000/api/messages/room/uuid-de-la-sala?limit=20&offset=20"
```

```javascript
// Response
{
    "success": true,
    "data": [
        {
            "id": "msg-uuid-1",
            "roomId": "sala-uuid",
            "userId": "user-uuid",
            "username": "Juan123",
            "content": "¡Hola a todos!",
            "timestamp": "2023-10-15T12:30:00.000Z",
            "type": "text"
        },
        {
            "id": "msg-uuid-2",
            "roomId": "sala-uuid",
            "userId": "system",
            "username": "Sistema",
            "content": "María456 se unió a la sala",
            "timestamp": "2023-10-15T12:31:00.000Z",
            "type": "system"
        }
    ],
    "pagination": {
        "limit": 20,
        "offset": 0,
        "total": 150
    }
}
```

#### Obtener mensaje específico

```bash
curl -X GET http://localhost:3000/api/messages/uuid-del-mensaje
```

#### Eliminar mensaje

```bash
curl -X DELETE http://localhost:3000/api/messages/uuid-del-mensaje
```

### Health Check

```bash
curl -X GET http://localhost:3000/health
```

```javascript
// Response
{
    "status": "OK",
    "timestamp": "2023-10-15T12:45:30.123Z",
    "redis": "connected"
}
```

## 🔍 Búsqueda de Salas

```bash
# Buscar salas que contengan "desarrollo" en nombre o descripción
curl -X GET "http://localhost:3000/api/rooms?search=desarrollo"
```

## 🛡️ Manejo de Errores

### Errores de Socket.io

```javascript
socket.on('error', (error) => {
    console.error('Error del servidor:', error.message);
    
    // Ejemplos de errores:
    // - "Nombre de usuario requerido"
    // - "Sala no encontrada"
    // - "Sala llena"
    // - "Debes estar en una sala para enviar mensajes"
});
```

### Errores de API REST

```javascript
// Error 400 - Bad Request
{
    "success": false,
    "error": "\"content\" is required"
}

// Error 404 - Not Found
{
    "success": false,
    "error": "Sala no encontrada"
}

// Error 500 - Internal Server Error
{
    "success": false,
    "error": "Error interno del servidor"
}
```

## 📱 Ejemplo Cliente React

```jsx
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const ChatApp = () => {
    const [socket, setSocket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageInput, setMessageInput] = useState('');
    const [currentRoom, setCurrentRoom] = useState(null);

    useEffect(() => {
        const newSocket = io('http://localhost:3000');
        setSocket(newSocket);

        newSocket.on('message:new', (message) => {
            setMessages(prev => [...prev, message]);
        });

        newSocket.on('room:joined', (data) => {
            setCurrentRoom(data);
            setMessages(data.messages);
        });

        return () => newSocket.close();
    }, []);

    const joinChat = (username) => {
        socket.emit('user:join', { username });
    };

    const joinRoom = (roomId) => {
        socket.emit('room:join', { roomId });
    };

    const sendMessage = () => {
        if (messageInput.trim()) {
            socket.emit('message:send', { content: messageInput });
            setMessageInput('');
        }
    };

    return (
        <div>
            {/* UI del chat */}
            <div>
                {messages.map(msg => (
                    <div key={msg.id}>
                        <strong>{msg.username}:</strong> {msg.content}
                    </div>
                ))}
            </div>
            <input 
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage}>Enviar</button>
        </div>
    );
};

export default ChatApp;
```

## 🔧 Testing con Postman

### Collection Setup

1. **Variables de entorno:**
   ```
   base_url: http://localhost:3000
   room_id: uuid-de-sala-para-tests
   message_id: uuid-de-mensaje-para-tests
   ```

2. **Tests automatizados:**
   ```javascript
   // En cada request de Postman
   pm.test("Status code is 200", function () {
       pm.response.to.have.status(200);
   });
   
   pm.test("Response has success property", function () {
       var jsonData = pm.response.json();
       pm.expect(jsonData).to.have.property('success');
       pm.expect(jsonData.success).to.be.true;
   });
   ```

## 🐛 Debugging

### Logs útiles

```bash
# Ver logs en tiempo real
npm run dev

# Logs específicos de Redis
redis-cli monitor

# Verificar conexiones Socket.io
# En el browser console:
socket.connected  // true/false
socket.id         // ID del socket
```

### Comandos Redis útiles

```bash
# Ver todas las claves
redis-cli keys "chat:*"

# Ver mensajes de una sala
redis-cli lrange "chat:room_messages:uuid-sala" 0 -1

# Ver datos de usuario
redis-cli hgetall "chat:users:uuid-usuario"

# Ver usuarios en sala
redis-cli smembers "chat:room_users:uuid-sala"

# Limpiar todo (¡CUIDADO!)
redis-cli flushall
```

## 📊 Monitoreo

### Métricas importantes

```bash
# Conexiones activas
redis-cli info clients

# Memoria usada
redis-cli info memory

# Estadísticas de comandos
redis-cli info commandstats

# Uptime del servidor
redis-cli info server
```

### Performance Testing

```bash
# Usar wrk para load testing
wrk -t12 -c400 -d30s http://localhost:3000/health

# Socket.io load testing con artillery
artillery quick --count 100 --num 10 ws://localhost:3000
```

Este documento cubre los casos de uso más comunes. ¿Hay algún ejemplo específico que te gustaría que agregue o profundice?