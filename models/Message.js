const { v4: uuidv4 } = require('uuid');

class Message {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.roomId = data.roomId;
    this.userId = data.userId;
    this.username = data.username;
    this.content = data.content;
    this.timestamp = data.timestamp || new Date().toISOString();
    this.type = data.type || 'text'; // text, image, file, system
  }

  // Convertir a objeto plano para almacenar en Redis
  toRedisObject() {
    return {
      id: this.id,
      roomId: this.roomId,
      userId: this.userId,
      username: this.username,
      content: this.content,
      timestamp: this.timestamp,
      type: this.type
    };
  }

  // Crear instancia desde datos de Redis
  static fromRedisObject(data) {
    return new Message(data);
  }

  // Validar mensaje
  isValid() {
    return !!(
      this.roomId && 
      this.userId && 
      this.username && 
      this.content && 
      this.content.trim().length > 0 &&
      this.content.length <= (process.env.MAX_MESSAGE_LENGTH || 500)
    );
  }
}

module.exports = Message;