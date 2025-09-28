const { v4: uuidv4 } = require('uuid');

class Room {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.description = data.description || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.createdBy = data.createdBy;
    this.isPrivate = data.isPrivate || false;
    this.maxUsers = data.maxUsers || parseInt(process.env.MAX_USERS_PER_ROOM) || 50;
    this.userCount = data.userCount || 0;
  }

  // Convertir a objeto plano para almacenar en Redis
  toRedisObject() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
      isPrivate: this.isPrivate,
      maxUsers: this.maxUsers,
      userCount: this.userCount
    };
  }

  // Crear instancia desde datos de Redis
  static fromRedisObject(data) {
    return new Room(data);
  }

  // Validar sala
  isValid() {
    return !!(
      this.name && 
      this.name.trim().length > 0 &&
      this.name.length <= 100 &&
      this.createdBy
    );
  }

  // Verificar si la sala está llena
  isFull() {
    return this.userCount >= this.maxUsers;
  }

  // Incrementar contador de usuarios
  incrementUserCount() {
    this.userCount++;
  }

  // Decrementar contador de usuarios
  decrementUserCount() {
    if (this.userCount > 0) {
      this.userCount--;
    }
  }
}

module.exports = Room;