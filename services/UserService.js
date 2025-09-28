const User = require('../models/User');

class UserService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.USER_KEY_PREFIX = 'chat:users:';
    this.ROOM_USERS_KEY_PREFIX = 'chat:room_users:';
    this.SOCKET_USER_KEY_PREFIX = 'chat:socket_users:';
  }

  // Crear o actualizar usuario
  async saveUser(userData) {
    try {
      const user = new User(userData);
      
      if (!user.isValid()) {
        throw new Error('Datos del usuario inválidos');
      }

      const userKey = `${this.USER_KEY_PREFIX}${user.id}`;
      const socketUserKey = `${this.SOCKET_USER_KEY_PREFIX}${user.socketId}`;

      // Guardar datos del usuario
      await this.redis.hSet(userKey, user.toRedisObject());
      
      // Mapear socket ID a user ID
      await this.redis.set(socketUserKey, user.id);
      
      // Establecer TTL (24 horas)
      await this.redis.expire(userKey, 86400);
      await this.redis.expire(socketUserKey, 86400);

      return user;
    } catch (error) {
      console.error('Error guardando usuario:', error);
      throw error;
    }
  }

  // Obtener usuario por ID
  async getUser(userId) {
    try {
      const userKey = `${this.USER_KEY_PREFIX}${userId}`;
      const userData = await this.redis.hGetAll(userKey);
      
      if (Object.keys(userData).length === 0) {
        return null;
      }

      return User.fromRedisObject(userData);
    } catch (error) {
      console.error('Error obteniendo usuario:', error);
      throw error;
    }
  }

  // Obtener usuario por socket ID
  async getUserBySocketId(socketId) {
    try {
      const socketUserKey = `${this.SOCKET_USER_KEY_PREFIX}${socketId}`;
      const userId = await this.redis.get(socketUserKey);
      
      if (!userId) {
        return null;
      }

      return await this.getUser(userId);
    } catch (error) {
      console.error('Error obteniendo usuario por socket:', error);
      throw error;
    }
  }

  // Añadir usuario a una sala
  async addUserToRoom(userId, roomId) {
    try {
      const roomUsersKey = `${this.ROOM_USERS_KEY_PREFIX}${roomId}`;
      await this.redis.sAdd(roomUsersKey, userId);
      
      // Actualizar el roomId del usuario
      const userKey = `${this.USER_KEY_PREFIX}${userId}`;
      await this.redis.hSet(userKey, 'roomId', roomId);
      
      return true;
    } catch (error) {
      console.error('Error añadiendo usuario a sala:', error);
      throw error;
    }
  }

  // Remover usuario de una sala
  async removeUserFromRoom(userId, roomId) {
    try {
      const roomUsersKey = `${this.ROOM_USERS_KEY_PREFIX}${roomId}`;
      await this.redis.sRem(roomUsersKey, userId);
      
      // Limpiar el roomId del usuario
      const userKey = `${this.USER_KEY_PREFIX}${userId}`;
      await this.redis.hSet(userKey, 'roomId', '');
      
      return true;
    } catch (error) {
      console.error('Error removiendo usuario de sala:', error);
      throw error;
    }
  }

  // Obtener usuarios de una sala
  async getRoomUsers(roomId) {
    try {
      const roomUsersKey = `${this.ROOM_USERS_KEY_PREFIX}${roomId}`;
      const userIds = await this.redis.sMembers(roomUsersKey);
      
      const users = [];
      for (const userId of userIds) {
        const user = await this.getUser(userId);
        if (user) {
          users.push(user);
        }
      }

      return users;
    } catch (error) {
      console.error('Error obteniendo usuarios de sala:', error);
      throw error;
    }
  }

  // Contar usuarios en una sala
  async countRoomUsers(roomId) {
    try {
      const roomUsersKey = `${this.ROOM_USERS_KEY_PREFIX}${roomId}`;
      return await this.redis.sCard(roomUsersKey);
    } catch (error) {
      console.error('Error contando usuarios:', error);
      throw error;
    }
  }

  // Marcar usuario como offline
  async setUserOffline(userId) {
    try {
      const user = await this.getUser(userId);
      if (user) {
        user.setOffline();
        await this.saveUser(user);
      }
      return user;
    } catch (error) {
      console.error('Error marcando usuario offline:', error);
      throw error;
    }
  }

  // Limpiar datos de usuario al desconectar
  async cleanupUser(socketId) {
    try {
      const user = await this.getUserBySocketId(socketId);
      if (user) {
        // Remover de la sala si está en una
        if (user.roomId) {
          await this.removeUserFromRoom(user.id, user.roomId);
        }
        
        // Marcar como offline
        await this.setUserOffline(user.id);
        
        // Limpiar mapeo de socket
        const socketUserKey = `${this.SOCKET_USER_KEY_PREFIX}${socketId}`;
        await this.redis.del(socketUserKey);
      }
      return user;
    } catch (error) {
      console.error('Error limpiando usuario:', error);
      throw error;
    }
  }
}

module.exports = UserService;