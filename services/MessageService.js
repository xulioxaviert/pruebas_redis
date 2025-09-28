const Message = require('../models/Message');

class MessageService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.MESSAGE_KEY_PREFIX = 'chat:messages:';
    this.ROOM_MESSAGES_KEY_PREFIX = 'chat:room_messages:';
  }

  // Guardar un mensaje
  async saveMessage(messageData) {
    try {
      const message = new Message(messageData);
      
      if (!message.isValid()) {
        throw new Error('Datos del mensaje inválidos');
      }

      const messageKey = `${this.MESSAGE_KEY_PREFIX}${message.id}`;
      const roomMessagesKey = `${this.ROOM_MESSAGES_KEY_PREFIX}${message.roomId}`;

      // Guardar el mensaje
      await this.redis.hSet(messageKey, message.toRedisObject());
      
      // Añadir el ID del mensaje a la lista de mensajes de la sala
      await this.redis.lPush(roomMessagesKey, message.id);
      
      // Limitar el número de mensajes por sala (últimos 1000)
      await this.redis.lTrim(roomMessagesKey, 0, 999);
      
      // Establecer TTL para el mensaje (7 días por defecto)
      const ttl = parseInt(process.env.MESSAGE_RETENTION_DAYS) * 24 * 60 * 60 || 604800;
      await this.redis.expire(messageKey, ttl);

      return message;
    } catch (error) {
      console.error('Error guardando mensaje:', error);
      throw error;
    }
  }

  // Obtener mensajes de una sala
  async getRoomMessages(roomId, limit = 50, offset = 0) {
    try {
      const roomMessagesKey = `${this.ROOM_MESSAGES_KEY_PREFIX}${roomId}`;
      
      // Obtener IDs de mensajes (los más recientes primero)
      const messageIds = await this.redis.lRange(roomMessagesKey, offset, offset + limit - 1);
      
      if (messageIds.length === 0) {
        return [];
      }

      // Obtener los datos de cada mensaje
      const messages = [];
      for (const messageId of messageIds) {
        const messageKey = `${this.MESSAGE_KEY_PREFIX}${messageId}`;
        const messageData = await this.redis.hGetAll(messageKey);
        
        if (Object.keys(messageData).length > 0) {
          messages.push(Message.fromRedisObject(messageData));
        }
      }

      return messages.reverse(); // Devolver en orden cronológico
    } catch (error) {
      console.error('Error obteniendo mensajes de la sala:', error);
      throw error;
    }
  }

  // Obtener un mensaje específico
  async getMessage(messageId) {
    try {
      const messageKey = `${this.MESSAGE_KEY_PREFIX}${messageId}`;
      const messageData = await this.redis.hGetAll(messageKey);
      
      if (Object.keys(messageData).length === 0) {
        return null;
      }

      return Message.fromRedisObject(messageData);
    } catch (error) {
      console.error('Error obteniendo mensaje:', error);
      throw error;
    }
  }

  // Eliminar un mensaje
  async deleteMessage(messageId) {
    try {
      const messageKey = `${this.MESSAGE_KEY_PREFIX}${messageId}`;
      const result = await this.redis.del(messageKey);
      return result > 0;
    } catch (error) {
      console.error('Error eliminando mensaje:', error);
      throw error;
    }
  }

  // Contar mensajes en una sala
  async countRoomMessages(roomId) {
    try {
      const roomMessagesKey = `${this.ROOM_MESSAGES_KEY_PREFIX}${roomId}`;
      return await this.redis.lLen(roomMessagesKey);
    } catch (error) {
      console.error('Error contando mensajes:', error);
      throw error;
    }
  }
}

module.exports = MessageService;