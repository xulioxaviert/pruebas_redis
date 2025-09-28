const Joi = require('joi');

// Esquemas de validación
const messageSchema = Joi.object({
  content: Joi.string().trim().min(1).max(500).required()
});

const joinRoomSchema = Joi.object({
  roomId: Joi.string().required()
});

const createRoomSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(500).optional().allow(''),
  isPrivate: Joi.boolean().optional(),
  maxUsers: Joi.number().integer().min(1).max(200).optional(),
  createdBy: Joi.string().required()
});

const userJoinSchema = Joi.object({
  username: Joi.string().trim().min(1).max(50).required()
});

// Funciones de validación
const validateMessage = (data) => {
  const { error } = messageSchema.validate(data);
  return {
    isValid: !error,
    error: error ? error.details[0].message : null
  };
};

const validateJoinRoom = (data) => {
  const { error } = joinRoomSchema.validate(data);
  return {
    isValid: !error,
    error: error ? error.details[0].message : null
  };
};

const validateCreateRoom = (data) => {
  const { error } = createRoomSchema.validate(data);
  return {
    isValid: !error,
    error: error ? error.details[0].message : null
  };
};

const validateUserJoin = (data) => {
  const { error } = userJoinSchema.validate(data);
  return {
    isValid: !error,
    error: error ? error.details[0].message : null
  };
};

// Validador para nombres de usuario únicos (simulado)
const isUsernameAvailable = async (username, excludeUserId = null) => {
  // En una implementación real, consultarías Redis aquí
  // Por ahora, simulamos que todos los nombres están disponibles
  return true;
};

// Sanitizar contenido HTML
const sanitizeHtml = (content) => {
  return content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Validar formato de ID (UUID v4)
const isValidUUID = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// Validar longitud de mensaje
const isValidMessageLength = (content) => {
  const maxLength = parseInt(process.env.MAX_MESSAGE_LENGTH) || 500;
  return content && content.trim().length > 0 && content.length <= maxLength;
};

// Filtrar palabras prohibidas (básico)
const containsProfanity = (content) => {
  const profanityList = ['spam', 'malware']; // Lista básica, expándela según necesites
  const lowerContent = content.toLowerCase();
  return profanityList.some(word => lowerContent.includes(word));
};

// Validar rate limiting (mensajes por minuto)
const validateRateLimit = (userId, messagesInLastMinute) => {
  const maxMessagesPerMinute = 30; // Límite de mensajes por minuto
  return messagesInLastMinute < maxMessagesPerMinute;
};

module.exports = {
  validateMessage,
  validateJoinRoom,
  validateCreateRoom,
  validateUserJoin,
  isUsernameAvailable,
  sanitizeHtml,
  isValidUUID,
  isValidMessageLength,
  containsProfanity,
  validateRateLimit
};