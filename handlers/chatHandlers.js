/**
 * Manejadores de eventos de Socket.io para el sistema de chat
 * 
 * Este módulo define todos los event handlers que manejan la comunicación
 * en tiempo real entre clientes y servidor. Cada handler:
 * 
 * 1. Valida los datos de entrada
 * 2. Realiza operaciones de negocio usando los servicios
 * 3. Actualiza el estado en Redis
 * 4. Notifica a los clientes relevantes
 * 5. Maneja errores y notifica al cliente
 * 
 * Eventos manejados:
 * - user:join → Usuario se conecta al chat
 * - room:join → Usuario se une a una sala  
 * - message:send → Usuario envía mensaje
 * - typing:start/stop → Indicadores de escritura
 * - room:leave → Usuario sale de sala
 * - disconnect → Usuario se desconecta
 * 
 * Patrones de respuesta:
 * - socket.emit() → Respuesta solo al cliente que envió el evento
 * - socket.to(room).emit() → Broadcast a otros usuarios en la sala
 * - io.to(room).emit() → Broadcast a todos los usuarios en la sala
 */

const MessageService = require('../services/MessageService');
const UserService = require('../services/UserService');
const RoomService = require('../services/RoomService');
const { validateMessage, validateJoinRoom } = require('../utils/validators');

/**
 * Factory function que retorna los manejadores de eventos para un socket
 * 
 * @param {Object} socket - Instancia de Socket.io para este cliente
 * @param {Object} io - Instancia del servidor Socket.io
 * @param {Object} redisClient - Cliente Redis para persistencia
 */
module.exports = (socket, io, redisClient) => {
  const messageService = new MessageService(redisClient);
  const userService = new UserService(redisClient);
  const roomService = new RoomService(redisClient);

  /**
   * Handler: Usuario se une al chat (autenticación básica)
   * 
   * Este es el primer evento que debe enviar un cliente para usar el chat.
   * Crea o actualiza el perfil del usuario en Redis y establece la sesión.
   * 
   * Flujo:
   * 1. Validar que el username no esté vacío
   * 2. Crear usuario en Redis con socket ID actual
   * 3. Almacenar datos del usuario en el socket para uso posterior
   * 4. Confirmar conexión exitosa al cliente
   * 5. Log de auditoria
   * 
   * @param {Object} data - Datos del evento
   * @param {string} data.username - Nombre visible del usuario (requerido)
   * 
   * Emite:
   * - 'user:joined' → Confirmación exitosa con datos del usuario
   * - 'error' → Si hay error de validación o servidor
   * 
   * Estado del socket después:
   * - socket.userId → ID único del usuario
   * - socket.username → Nombre visible del usuario
   * - socket.currentRoom → undefined (aún no está en ninguna sala)
   */
  socket.on('user:join', async (data) => {
    try {
      const { username } = data;
      
      // Validación básica de entrada
      if (!username || username.trim().length === 0) {
        socket.emit('error', { message: 'Nombre de usuario requerido' });
        return;
      }

      // Crear usuario en Redis con mapeo bidireccional socket ↔ user
      const user = await userService.saveUser({
        username: username.trim(),
        socketId: socket.id // Crucial para encontrar usuario en otros eventos
      });

      // Almacenar datos en el socket para acceso rápido en otros handlers
      // Evita consultas a Redis en cada operación
      socket.userId = user.id;
      socket.username = user.username;

      // Confirmar al cliente que la conexión fue exitosa
      socket.emit('user:joined', {
        userId: user.id,
        username: user.username,
        message: 'Conectado exitosamente'
      });

      // Log de auditoria para debugging y monitoreo
      console.log(`Usuario ${user.username} (${user.id}) se conectó`);

    } catch (error) {
      console.error('Error en user:join:', error);
      socket.emit('error', { message: 'Error al conectar usuario' });
    }
  });

  /**
   * Handler: Usuario se une a una sala de chat
   * 
   * Este evento maneja toda la lógica de unión a salas, incluyendo:
   * - Validaciones de permisos y capacidad
   * - Salida automática de sala anterior
   * - Actualización de contadores y estado
   * - Notificaciones a otros usuarios
   * - Carga de historial de mensajes
   * 
   * Es una operación compleja que debe ser atómica: o todo funciona o nada cambia.
   * 
   * @param {Object} data - Datos del evento
   * @param {string} data.roomId - ID de la sala a la que unirse (requerido)
   * 
   * Validaciones realizadas:
   * 1. Usuario debe estar autenticado (user:join previo)
   * 2. La sala debe existir en Redis
   * 3. La sala no debe estar llena
   * 4. Datos de entrada válidos (roomId formato correcto)
   * 
   * Operaciones realizadas:
   * 1. Salir de sala anterior (si existe)
   * 2. Unirse a nueva sala en Socket.io (para broadcasts)
   * 3. Añadir usuario a la sala en Redis
   * 4. Actualizar contadores
   * 5. Obtener datos para el cliente (usuarios, mensajes)
   * 6. Notificar a todos los usuarios relevantes
   * 7. Crear mensaje del sistema
   * 
   * Emite:
   * - 'room:joined' → Al usuario que se une (datos completos de la sala)
   * - 'user:entered' → A otros usuarios en la sala (notificación)
   * - 'message:new' → A todos en la sala (mensaje del sistema)
   * - 'error' → Si hay error en cualquier paso
   */
  socket.on('room:join', async (data) => {
    try {
      // Validación de esquema usando Joi
      const validation = validateJoinRoom(data);
      if (!validation.isValid) {
        socket.emit('error', { message: validation.error });
        return;
      }

      const { roomId } = data;
      
      // Verificar que el usuario esté autenticado
      if (!socket.userId) {
        socket.emit('error', { message: 'Debes identificarte primero' });
        return;
      }

      // Verificar que la sala existe en Redis
      const room = await roomService.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Sala no encontrada' });
        return;
      }

      // Verificar permisos y capacidad de la sala
      const canJoin = await roomService.canUserJoinRoom(roomId, socket.userId);
      if (!canJoin.canJoin) {
        socket.emit('error', { message: canJoin.reason });
        return;
      }

      // Salir de sala anterior automáticamente
      // Esto mantiene la regla: un usuario solo puede estar en una sala
      if (socket.currentRoom) {
        await handleLeaveRoom(socket.currentRoom);
      }

      // === OPERACIONES DE UNIÓN ===
      
      // 1. Unirse a la sala en Socket.io (para recibir broadcasts)
      socket.join(roomId);
      socket.currentRoom = roomId; // Trackear sala actual en el socket

      // 2. Añadir usuario a la sala en Redis (persistencia)
      await userService.addUserToRoom(socket.userId, roomId);
      
      // 3. Actualizar contador de usuarios en tiempo real
      const userCount = await userService.countRoomUsers(roomId);
      await roomService.updateUserCount(roomId, userCount);

      // === PREPARAR DATOS PARA EL CLIENTE ===
      
      // Obtener lista de usuarios activos en la sala
      const users = await userService.getRoomUsers(roomId);
      
      // Obtener historial reciente de mensajes (50 más recientes)
      const messages = await messageService.getRoomMessages(roomId, 50);

      // === NOTIFICACIONES ===
      
      // Respuesta completa al usuario que se une
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

      // Notificar a otros usuarios en la sala (sin incluir al que se une)
      socket.to(roomId).emit('user:entered', {
        userId: socket.userId,
        username: socket.username,
        userCount
      });

      // Crear y enviar mensaje del sistema a todos
      const systemMessage = await messageService.saveMessage({
        roomId,
        userId: 'system',          // ID especial para mensajes del sistema
        username: 'Sistema',
        content: `${socket.username} se unió a la sala`,
        type: 'system'             // Tipo especial para estilos diferentes
      });

      // Broadcast del mensaje del sistema a todos (incluyendo al que se une)
      io.to(roomId).emit('message:new', systemMessage);

      console.log(`Usuario ${socket.username} se unió a la sala ${room.name}`);

    } catch (error) {
      console.error('Error en room:join:', error);
      socket.emit('error', { message: 'Error al unirse a la sala' });
    }
  });

  /**
   * Handler: Usuario envía un mensaje a la sala actual
   * 
   * Este es el evento más frecuente del sistema. Debe ser:
   * - Rápido: Mínima latencia entre envío y recepción
   * - Confiable: El mensaje debe persistir y llegar a todos
   * - Seguro: Validación y sanitización de contenido
   * 
   * Flujo optimizado:
   * 1. Validar datos y permisos
   * 2. Persistir mensaje en Redis (con TTL)
   * 3. Broadcast inmediato a todos los usuarios de la sala
   * 4. Log para auditorra/debugging
   * 
   * @param {Object} data - Datos del evento
   * @param {string} data.content - Contenido del mensaje (requerido, max 500 chars)
   * 
   * Validaciones realizadas:
   * 1. Usuario autenticado (socket.userId existe)
   * 2. Usuario en una sala (socket.currentRoom existe)
   * 3. Contenido válido (no vacío, longitud adecuada)
   * 4. Esquema Joi para estructura de datos
   * 
   * Optimizaciones implementadas:
   * - Usa datos cacheados en socket (userId, username, currentRoom)
   * - Broadcast simultáneo con persistencia (no espera confirmación)
   * - Validación temprana para fallar rápido
   * 
   * Emite:
   * - 'message:new' → A todos los usuarios en la sala (incluye al emisor)
   * - 'error' → Solo al emisor si hay error
   * 
   * Nota: El mensaje se envía también al emisor para confirmación visual
   * y para mantener consistencia en la UI (todos ven lo mismo).
   */
  socket.on('message:send', async (data) => {
    try {
      // Validación de esquema usando Joi (longitud, tipo, etc.)
      const validation = validateMessage(data);
      if (!validation.isValid) {
        socket.emit('error', { message: validation.error });
        return;
      }

      const { content } = data;

      // Verificar estado del usuario (autenticado y en sala)
      if (!socket.userId || !socket.currentRoom) {
        socket.emit('error', { message: 'Debes estar en una sala para enviar mensajes' });
        return;
      }

      // Crear y persistir mensaje en Redis
      // Incluye generación de ID, timestamp, y configuración de TTL
      const message = await messageService.saveMessage({
        roomId: socket.currentRoom,   // Sala actual del usuario
        userId: socket.userId,        // ID único del emisor
        username: socket.username,    // Nombre visible del emisor
        content: content.trim()       // Contenido limpio (sin espacios extra)
      });

      // Broadcast inmediato a TODOS los usuarios de la sala
      // Incluye al emisor para confirmación visual
      io.to(socket.currentRoom).emit('message:new', message);

      // Log de auditoria (puede ser importante para moderación)
      console.log(`Mensaje de ${socket.username} en sala ${socket.currentRoom}: ${content}`);

    } catch (error) {
      console.error('Error en message:send:', error);
      socket.emit('error', { message: 'Error al enviar mensaje' });
    }
  });

  // Usuario está escribiendo
  socket.on('typing:start', () => {
    if (socket.currentRoom && socket.username) {
      socket.to(socket.currentRoom).emit('user:typing', {
        userId: socket.userId,
        username: socket.username
      });
    }
  });

  // Usuario dejó de escribir
  socket.on('typing:stop', () => {
    if (socket.currentRoom && socket.username) {
      socket.to(socket.currentRoom).emit('user:stopped_typing', {
        userId: socket.userId,
        username: socket.username
      });
    }
  });

  // Usuario sale de una sala
  socket.on('room:leave', async () => {
    if (socket.currentRoom) {
      await handleLeaveRoom(socket.currentRoom);
    }
  });

  // Función para manejar salida de sala
  const handleLeaveRoom = async (roomId) => {
    try {
      if (!socket.userId) return;

      // Salir de la sala de Socket.io
      socket.leave(roomId);

      // Remover usuario de la sala en Redis
      await userService.removeUserFromRoom(socket.userId, roomId);
      
      // Actualizar contador de usuarios
      const userCount = await userService.countRoomUsers(roomId);
      await roomService.updateUserCount(roomId, userCount);

      // Notificar a otros usuarios
      socket.to(roomId).emit('user:left', {
        userId: socket.userId,
        username: socket.username,
        userCount
      });

      // Mensaje del sistema
      if (socket.username) {
        const systemMessage = await messageService.saveMessage({
          roomId,
          userId: 'system',
          username: 'Sistema',
          content: `${socket.username} salió de la sala`,
          type: 'system'
        });

        io.to(roomId).emit('message:new', systemMessage);
      }

      socket.currentRoom = null;

      console.log(`Usuario ${socket.username || socket.userId} salió de la sala ${roomId}`);

    } catch (error) {
      console.error('Error al salir de sala:', error);
    }
  };

  // Cuando se desconecta el usuario
  socket.on('disconnect', async () => {
    try {
      if (socket.currentRoom) {
        await handleLeaveRoom(socket.currentRoom);
      }

      // Limpiar datos del usuario
      if (socket.id) {
        await userService.cleanupUser(socket.id);
      }

      console.log(`Usuario ${socket.username || 'desconocido'} se desconectó`);

    } catch (error) {
      console.error('Error en disconnect:', error);
    }
  });
};