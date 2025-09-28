const MessageService = require('../services/MessageService');
const UserService = require('../services/UserService');
const RoomService = require('../services/RoomService');
const { validateMessage, validateJoinRoom } = require('../utils/validators');

module.exports = (socket, io, redisClient) => {
  const messageService = new MessageService(redisClient);
  const userService = new UserService(redisClient);
  const roomService = new RoomService(redisClient);

  // Usuario se une al chat
  socket.on('user:join', async (data) => {
    try {
      const { username } = data;
      
      if (!username || username.trim().length === 0) {
        socket.emit('error', { message: 'Nombre de usuario requerido' });
        return;
      }

      // Crear o actualizar usuario
      const user = await userService.saveUser({
        username: username.trim(),
        socketId: socket.id
      });

      socket.userId = user.id;
      socket.username = user.username;

      socket.emit('user:joined', {
        userId: user.id,
        username: user.username,
        message: 'Conectado exitosamente'
      });

      console.log(`Usuario ${user.username} (${user.id}) se conectó`);

    } catch (error) {
      console.error('Error en user:join:', error);
      socket.emit('error', { message: 'Error al conectar usuario' });
    }
  });

  // Usuario se une a una sala
  socket.on('room:join', async (data) => {
    try {
      const validation = validateJoinRoom(data);
      if (!validation.isValid) {
        socket.emit('error', { message: validation.error });
        return;
      }

      const { roomId } = data;
      
      if (!socket.userId) {
        socket.emit('error', { message: 'Debes identificarte primero' });
        return;
      }

      // Verificar si la sala existe
      const room = await roomService.getRoom(roomId);
      if (!room) {
        socket.emit('error', { message: 'Sala no encontrada' });
        return;
      }

      // Verificar si puede unirse
      const canJoin = await roomService.canUserJoinRoom(roomId, socket.userId);
      if (!canJoin.canJoin) {
        socket.emit('error', { message: canJoin.reason });
        return;
      }

      // Salir de sala anterior si existe
      if (socket.currentRoom) {
        await handleLeaveRoom(socket.currentRoom);
      }

      // Unirse a la nueva sala
      socket.join(roomId);
      socket.currentRoom = roomId;

      // Añadir usuario a la sala en Redis
      await userService.addUserToRoom(socket.userId, roomId);
      
      // Actualizar contador de usuarios
      const userCount = await userService.countRoomUsers(roomId);
      await roomService.updateUserCount(roomId, userCount);

      // Obtener usuarios de la sala
      const users = await userService.getRoomUsers(roomId);
      
      // Obtener mensajes recientes
      const messages = await messageService.getRoomMessages(roomId, 50);

      // Notificar al usuario
      socket.emit('room:joined', {
        roomId,
        roomName: room.name,
        users: users.map(u => ({ id: u.id, username: u.username, isOnline: u.isOnline })),
        messages,
        userCount
      });

      // Notificar a otros usuarios de la sala
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

      io.to(roomId).emit('message:new', systemMessage);

      console.log(`Usuario ${socket.username} se unió a la sala ${room.name}`);

    } catch (error) {
      console.error('Error en room:join:', error);
      socket.emit('error', { message: 'Error al unirse a la sala' });
    }
  });

  // Usuario envía un mensaje
  socket.on('message:send', async (data) => {
    try {
      const validation = validateMessage(data);
      if (!validation.isValid) {
        socket.emit('error', { message: validation.error });
        return;
      }

      const { content } = data;

      if (!socket.userId || !socket.currentRoom) {
        socket.emit('error', { message: 'Debes estar en una sala para enviar mensajes' });
        return;
      }

      // Crear y guardar mensaje
      const message = await messageService.saveMessage({
        roomId: socket.currentRoom,
        userId: socket.userId,
        username: socket.username,
        content: content.trim()
      });

      // Enviar mensaje a todos los usuarios de la sala
      io.to(socket.currentRoom).emit('message:new', message);

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