const Room = require('../models/Room');

class RoomService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.ROOM_KEY_PREFIX = 'chat:rooms:';
    this.ROOMS_LIST_KEY = 'chat:rooms_list';
  }

  // Crear una nueva sala
  async createRoom(roomData) {
    try {
      const room = new Room(roomData);
      
      if (!room.isValid()) {
        throw new Error('Datos de la sala inválidos');
      }

      const roomKey = `${this.ROOM_KEY_PREFIX}${room.id}`;

      // Guardar datos de la sala
      await this.redis.hSet(roomKey, room.toRedisObject());
      
      // Añadir a la lista de salas
      await this.redis.sAdd(this.ROOMS_LIST_KEY, room.id);

      return room;
    } catch (error) {
      console.error('Error creando sala:', error);
      throw error;
    }
  }

  // Obtener sala por ID
  async getRoom(roomId) {
    try {
      const roomKey = `${this.ROOM_KEY_PREFIX}${roomId}`;
      const roomData = await this.redis.hGetAll(roomKey);
      
      if (Object.keys(roomData).length === 0) {
        return null;
      }

      return Room.fromRedisObject(roomData);
    } catch (error) {
      console.error('Error obteniendo sala:', error);
      throw error;
    }
  }

  // Obtener todas las salas
  async getAllRooms() {
    try {
      const roomIds = await this.redis.sMembers(this.ROOMS_LIST_KEY);
      
      const rooms = [];
      for (const roomId of roomIds) {
        const room = await this.getRoom(roomId);
        if (room) {
          rooms.push(room);
        }
      }

      return rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      console.error('Error obteniendo todas las salas:', error);
      throw error;
    }
  }

  // Obtener salas públicas
  async getPublicRooms() {
    try {
      const allRooms = await this.getAllRooms();
      return allRooms.filter(room => !room.isPrivate);
    } catch (error) {
      console.error('Error obteniendo salas públicas:', error);
      throw error;
    }
  }

  // Actualizar sala
  async updateRoom(roomId, updateData) {
    try {
      const room = await this.getRoom(roomId);
      if (!room) {
        throw new Error('Sala no encontrada');
      }

      // Actualizar campos permitidos
      const allowedFields = ['name', 'description', 'maxUsers', 'isPrivate'];
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          room[field] = updateData[field];
        }
      }

      if (!room.isValid()) {
        throw new Error('Datos de actualización inválidos');
      }

      const roomKey = `${this.ROOM_KEY_PREFIX}${roomId}`;
      await this.redis.hSet(roomKey, room.toRedisObject());

      return room;
    } catch (error) {
      console.error('Error actualizando sala:', error);
      throw error;
    }
  }

  // Eliminar sala
  async deleteRoom(roomId) {
    try {
      const roomKey = `${this.ROOM_KEY_PREFIX}${roomId}`;
      
      // Eliminar de la lista de salas
      await this.redis.sRem(this.ROOMS_LIST_KEY, roomId);
      
      // Eliminar datos de la sala
      const result = await this.redis.del(roomKey);
      
      return result > 0;
    } catch (error) {
      console.error('Error eliminando sala:', error);
      throw error;
    }
  }

  // Actualizar contador de usuarios
  async updateUserCount(roomId, count) {
    try {
      const roomKey = `${this.ROOM_KEY_PREFIX}${roomId}`;
      await this.redis.hSet(roomKey, 'userCount', count);
      return true;
    } catch (error) {
      console.error('Error actualizando contador de usuarios:', error);
      throw error;
    }
  }

  // Verificar si el usuario puede unirse a la sala
  async canUserJoinRoom(roomId, userId) {
    try {
      const room = await this.getRoom(roomId);
      if (!room) {
        return { canJoin: false, reason: 'Sala no encontrada' };
      }

      if (room.isFull()) {
        return { canJoin: false, reason: 'Sala llena' };
      }

      return { canJoin: true };
    } catch (error) {
      console.error('Error verificando acceso a sala:', error);
      throw error;
    }
  }

  // Buscar salas por nombre
  async searchRooms(query) {
    try {
      const allRooms = await this.getPublicRooms();
      const searchTerm = query.toLowerCase();
      
      return allRooms.filter(room => 
        room.name.toLowerCase().includes(searchTerm) ||
        room.description.toLowerCase().includes(searchTerm)
      );
    } catch (error) {
      console.error('Error buscando salas:', error);
      throw error;
    }
  }
}

module.exports = RoomService;