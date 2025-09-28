const User = require('../models/User');

class UserService {
  /**
   * Constructor del servicio de usuarios
   * 
   * Define la estrategia de almacenamiento en Redis para usuarios.
   * Utiliza múltiples estructuras de datos para optimizar diferentes operaciones:
   * 
   * @param {Object} redisClient - Cliente Redis ya conectado
   * 
   * Estructura de datos en Redis:
   * - chat:users:{userId} → Hash con datos completos del usuario
   * - chat:room_users:{roomId} → Set con IDs de usuarios en la sala
   * - chat:socket_users:{socketId} → String que mapea socket a userID
   * 
   * Esta arquitectura permite:
   * - Lookup rápido de usuario por ID (O(1))
   * - Lookup rápido de usuario por socket ID (O(1))
   * - Contar usuarios en sala sin duplicados (O(1))
   * - Listar usuarios en sala (O(N) donde N = usuarios en sala)
   * - Añadir/remover usuarios de sala sin duplicados (O(1))
   */
  constructor(redisClient) {
    this.redis = redisClient;
    this.USER_KEY_PREFIX = 'chat:users:';              // Datos completos de usuarios
    this.ROOM_USERS_KEY_PREFIX = 'chat:room_users:';   // Sets de usuarios por sala
    this.SOCKET_USER_KEY_PREFIX = 'chat:socket_users:'; // Mapeo socket → usuario
  }

  /**
   * Crea o actualiza un usuario en Redis con doble mapeo
   * 
   * Esta función implementa un patrón de doble mapeo que permite:
   * 1. Encontrar usuario por su ID único
   * 2. Encontrar usuario por su socket ID (conexión WebSocket)
   * 
   * El doble mapeo es crucial para el manejo de eventos de Socket.io,
   * donde frecuentemente solo tenemos el socket ID.
   * 
   * @param {Object} userData - Datos del usuario a guardar
   * @param {string} [userData.id] - ID único del usuario (se genera si no existe)
   * @param {string} userData.username - Nombre visible del usuario
   * @param {string} userData.socketId - ID de la conexión WebSocket
   * @param {string} [userData.roomId] - ID de la sala actual (opcional)
   * 
   * @returns {Promise<User>} El usuario creado/actualizado
   * 
   * @throws {Error} Si los datos del usuario son inválidos
   * 
   * Operaciones realizadas en Redis:
   * 1. HSET chat:users:{userId} → Guarda datos completos del usuario
   * 2. SET chat:socket_users:{socketId} → Mapea socket a user ID
   * 3. EXPIRE ambas claves con TTL de 24h → Limpieza automática
   * 
   * TTL (Time To Live):
   * - 24 horas permite reconexiones temporales
   * - Evita acumulación de usuarios inactivos
   * - Se renueva en cada saveUser (keep-alive implícito)
   */
  async saveUser(userData) {
    try {
      // Crear instancia del modelo User con validación y generación de ID
      const user = new User(userData);
      
      // Validación temprana - falla rápido si datos son inválidos
      if (!user.isValid()) {
        throw new Error('Datos del usuario inválidos');
      }

      // Construir claves de Redis para este usuario específico
      const userKey = `${this.USER_KEY_PREFIX}${user.id}`;
      const socketUserKey = `${this.SOCKET_USER_KEY_PREFIX}${user.socketId}`;

      // 1. Guardar datos completos del usuario como Hash
      //    Permite acceso O(1) a todos los datos del usuario
      await this.redis.hSet(userKey, user.toRedisObject());
      
      // 2. Crear mapeo bidireccional socket → user
      //    Crucial para manejar eventos de Socket.io donde solo tenemos socketId
      await this.redis.set(socketUserKey, user.id);
      
      // 3. Configurar TTL para limpieza automática
      //    24 horas permite reconexiones pero evita acumulación
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

  /**
   * Añade un usuario a una sala usando Set de Redis
   * 
   * Esta función mantiene la integridad bidireccional:
   * - El usuario conoce su sala actual
   * - La sala conoce todos sus usuarios
   * 
   * Usa Redis Set para prevenir duplicados automáticamente.
   * Si el usuario ya está en la sala, la operación es idempotente.
   * 
   * @param {string} userId - ID único del usuario
   * @param {string} roomId - ID único de la sala
   * 
   * @returns {Promise<boolean>} true si la operación fue exitosa
   * 
   * @throws {Error} Si hay error en las operaciones de Redis
   * 
   * Operaciones realizadas en Redis:
   * 1. SADD chat:room_users:{roomId} {userId} → Añade usuario al Set de la sala
   * 2. HSET chat:users:{userId} roomId {roomId} → Actualiza sala actual del usuario
   * 
   * Ventajas del uso de Set:
   * - No permite duplicados (operación idempotente)
   * - Operaciones de unión/intersección eficientes
   * - Conteo rápido con SCARD (O(1))
   * - Eliminación rápida con SREM (O(1))
   * 
   * Nota: No verifica si la sala existe o está llena.
   * Esas validaciones deben hacerse antes de llamar esta función.
   */
  async addUserToRoom(userId, roomId) {
    try {
      const roomUsersKey = `${this.ROOM_USERS_KEY_PREFIX}${roomId}`;
      
      // Añadir usuario al Set de la sala
      // SADD es idempotente - no crea duplicados si ya existe
      await this.redis.sAdd(roomUsersKey, userId);
      
      // Actualizar la sala actual en el perfil del usuario
      // Esto permite saber rápidamente en qué sala está un usuario
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

  /**
   * Limpia todos los datos relacionados con un usuario al desconectarse
   * 
   * Esta función es crucial para mantener la integridad de los datos
   * y evitar usuarios "fantasma" en salas. Se ejecuta cuando:
   * - El usuario cierra el navegador
   * - Se pierde la conexión de red
   * - El servidor reinicia
   * 
   * Realiza limpieza completa pero preserva el historial de mensajes.
   * 
   * @param {string} socketId - ID de la conexión WebSocket que se desconectó
   * 
   * @returns {Promise<User|null>} El usuario que se limpió, o null si no se encontró
   * 
   * Proceso de limpieza:
   * 1. Buscar usuario por socket ID
   * 2. Si está en una sala, removerlo del Set de usuarios de la sala
   * 3. Marcar usuario como offline (actualizar estado y lastSeen)
   * 4. Eliminar mapeo socket → usuario
   * 5. Los datos del usuario se conservan (para historial)
   * 
   * Nota: Los mensajes del usuario NO se eliminan, solo su presencia activa.
   * Esto permite que el historial del chat se mantenga intacto.
   * 
   * El usuario puede volver a conectarse con el mismo nombre y
   * recuperará su ID si no ha expirado el TTL.
   */
  async cleanupUser(socketId) {
    try {
      // Buscar el usuario asociado a este socket
      const user = await this.getUserBySocketId(socketId);
      
      if (user) {
        // Si el usuario está en una sala, removerlo
        // Esto actualiza el contador de usuarios y notifica a otros
        if (user.roomId) {
          await this.removeUserFromRoom(user.id, user.roomId);
        }
        
        // Marcar como offline y actualizar timestamp de última conexión
        // Preserva el perfil del usuario para historial
        await this.setUserOffline(user.id);
        
        // Eliminar el mapeo socket → usuario
        // Esto libera el socket ID para futuros usuarios
        const socketUserKey = `${this.SOCKET_USER_KEY_PREFIX}${socketId}`;
        await this.redis.del(socketUserKey);
      }
      
      return user; // Retornar usuario limpiado para logging/notificaciones
    } catch (error) {
      console.error('Error limpiando usuario:', error);
      throw error;
    }
  }
}

module.exports = UserService;