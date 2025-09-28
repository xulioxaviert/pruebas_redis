const Message = require('../models/Message');

class MessageService {
  /**
   * Constructor del servicio de mensajes
   * 
   * Inicializa el servicio con un cliente Redis y define las claves que se usarán
   * para organizar los datos en Redis de manera eficiente.
   * 
   * @param {Object} redisClient - Cliente Redis ya conectado
   * 
   * Estructura de datos en Redis:
   * - chat:messages:{messageId} → Hash con datos completos del mensaje
   * - chat:room_messages:{roomId} → Lista ordenada de IDs de mensajes por sala
   * 
   * Esta separación permite:
   * - Acceso rápido a mensajes individuales (O(1))
   * - Listado cronológico por sala (O(N) donde N = límite de paginación)
   * - Paginación eficiente sin cargar todos los mensajes
   */
  constructor(redisClient) {
    this.redis = redisClient;
    this.MESSAGE_KEY_PREFIX = 'chat:messages:';           // Prefijo para mensajes individuales
    this.ROOM_MESSAGES_KEY_PREFIX = 'chat:room_messages:'; // Prefijo para listas de mensajes por sala
  }

  /**
   * Guarda un mensaje en Redis con múltiples operaciones atómicas
   * 
   * Esta función realiza varias operaciones en Redis para garantizar que:
   * 1. El mensaje se almacene con todos sus datos
   * 2. Se mantenga el orden cronológico en la sala
   * 3. No se acumulen infinitos mensajes
   * 4. Los mensajes antiguos se eliminen automáticamente
   * 
   * @param {Object} messageData - Datos del mensaje a guardar
   * @param {string} messageData.roomId - ID de la sala donde se envía
   * @param {string} messageData.userId - ID del usuario que envía
   * @param {string} messageData.username - Nombre visible del usuario
   * @param {string} messageData.content - Contenido del mensaje
   * @param {string} [messageData.type='text'] - Tipo de mensaje (text, system, image, etc.)
   * 
   * @returns {Promise<Message>} El mensaje creado con ID y timestamp generados
   * 
   * @throws {Error} Si los datos del mensaje son inválidos
   * 
   * Operaciones realizadas en Redis:
   * 1. HSET chat:messages:{id} → Almacena datos completos del mensaje
   * 2. LPUSH chat:room_messages:{roomId} → Añade ID a lista cronológica de la sala  
   * 3. LTRIM chat:room_messages:{roomId} 0 999 → Mantiene solo últimos 1000 mensajes
   * 4. EXPIRE chat:messages:{id} TTL → Programa eliminación automática
   */
  async saveMessage(messageData) {
    try {
      // Crear instancia del modelo Message que valida y genera ID único
      const message = new Message(messageData);
      
      // Validación temprana - falla rápido si datos son inválidos
      if (!message.isValid()) {
        throw new Error('Datos del mensaje inválidos');
      }

      // Construir claves de Redis para este mensaje específico
      const messageKey = `${this.MESSAGE_KEY_PREFIX}${message.id}`;
      const roomMessagesKey = `${this.ROOM_MESSAGES_KEY_PREFIX}${message.roomId}`;

      // 1. Guardar datos completos del mensaje como Hash
      //    Permite recuperar mensaje completo con una sola operación O(1)
      await this.redis.hSet(messageKey, message.toRedisObject());
      
      // 2. Añadir ID del mensaje al inicio de la lista de la sala
      //    LPUSH mantiene orden cronológico (más recientes primero)
      await this.redis.lPush(roomMessagesKey, message.id);
      
      // 3. Recortar lista para mantener solo últimos 1000 mensajes
      //    Previene crecimiento infinito de memoria
      await this.redis.lTrim(roomMessagesKey, 0, 999);
      
      // 4. Configurar TTL (Time To Live) para eliminación automática
      //    Los mensajes se eliminan automáticamente después del período configurado
      const ttl = parseInt(process.env.MESSAGE_RETENTION_DAYS) * 24 * 60 * 60 || 604800; // 7 días por defecto
      await this.redis.expire(messageKey, ttl);

      return message;
    } catch (error) {
      console.error('Error guardando mensaje:', error);
      throw error; // Re-lanzar para que el caller pueda manejar el error
    }
  }

  /**
   * Obtiene mensajes de una sala con paginación
   * 
   * Esta función implementa paginación eficiente usando las estructuras de Redis.
   * Primero obtiene los IDs de los mensajes (que están ordenados cronológicamente),
   * luego recupera los datos completos de cada mensaje.
   * 
   * @param {string} roomId - ID de la sala de la cual obtener mensajes
   * @param {number} [limit=50] - Número máximo de mensajes a retornar
   * @param {number} [offset=0] - Número de mensajes a saltar (para paginación)
   * 
   * @returns {Promise<Message[]>} Array de mensajes en orden cronológico (más antiguos primero)
   * 
   * Algoritmo de paginación:
   * 1. LRANGE para obtener slice de IDs de mensajes de la lista
   * 2. Para cada ID, HGETALL para obtener datos completos del mensaje
   * 3. Filtrar mensajes que puedan haber expirado (TTL)
   * 4. Revertir orden para mostrar cronológicamente
   * 
   * Ejemplo de uso:
   * - getRoomMessages('room123', 20, 0)  → Primeros 20 mensajes
   * - getRoomMessages('room123', 20, 20) → Siguientes 20 mensajes
   * 
   * Complejidad: O(limit) - solo consulta mensajes necesarios
   */
  async getRoomMessages(roomId, limit = 50, offset = 0) {
    try {
      const roomMessagesKey = `${this.ROOM_MESSAGES_KEY_PREFIX}${roomId}`;
      
      // Obtener slice de IDs de mensajes desde la lista ordenada
      // LRANGE es O(N) donde N = limit, no el total de mensajes
      // Los mensajes están ordenados: [más_reciente, ..., más_antiguo]
      const messageIds = await this.redis.lRange(roomMessagesKey, offset, offset + limit - 1);
      
      // Si no hay mensajes en este rango, retornar array vacío
      if (messageIds.length === 0) {
        return [];
      }

      // Obtener datos completos de cada mensaje
      const messages = [];
      for (const messageId of messageIds) {
        const messageKey = `${this.MESSAGE_KEY_PREFIX}${messageId}`;
        
        // Obtener todos los campos del Hash del mensaje
        const messageData = await this.redis.hGetAll(messageKey);
        
        // Verificar que el mensaje aún existe (no expiró por TTL)
        if (Object.keys(messageData).length > 0) {
          // Convertir datos de Redis de vuelta a instancia Message
          messages.push(Message.fromRedisObject(messageData));
        }
        // Si el mensaje no existe, simplemente lo omitimos
        // Esto puede pasar si el TTL expiró pero el ID aún está en la lista
      }

      // Revertir el orden para mostrar cronológicamente (más antiguos primero)
      // Esto facilita la visualización en el chat donde los nuevos mensajes
      // aparecen al final
      return messages.reverse();
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