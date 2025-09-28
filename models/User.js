const { v4: uuidv4 } = require('uuid');

class User {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.username = data.username;
    this.socketId = data.socketId;
    this.roomId = data.roomId;
    this.joinedAt = data.joinedAt || new Date().toISOString();
    this.isOnline = data.isOnline !== undefined ? data.isOnline : true;
    this.lastSeen = data.lastSeen || new Date().toISOString();
  }

  // Convertir a objeto plano para almacenar en Redis
  toRedisObject() {
    return {
      id: this.id,
      username: this.username,
      socketId: this.socketId,
      roomId: this.roomId,
      joinedAt: this.joinedAt,
      isOnline: this.isOnline,
      lastSeen: this.lastSeen
    };
  }

  // Crear instancia desde datos de Redis
  static fromRedisObject(data) {
    return new User(data);
  }

  // Validar usuario
  isValid() {
    return !!(
      this.username && 
      this.username.trim().length > 0 &&
      this.username.length <= 50 &&
      this.socketId
    );
  }

  // Marcar como offline
  setOffline() {
    this.isOnline = false;
    this.lastSeen = new Date().toISOString();
  }

  // Marcar como online
  setOnline(socketId) {
    this.isOnline = true;
    this.socketId = socketId;
    this.lastSeen = new Date().toISOString();
  }
}

module.exports = User;