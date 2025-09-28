const express = require('express');
const MessageService = require('../services/MessageService');
const redisClient = require('../config/redis');

const router = express.Router();
const messageService = new MessageService(redisClient);

// Obtener mensajes de una sala
router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const messages = await messageService.getRoomMessages(
      roomId, 
      parseInt(limit), 
      parseInt(offset)
    );

    res.json({
      success: true,
      data: messages,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: await messageService.countRoomMessages(roomId)
      }
    });

  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mensajes'
    });
  }
});

// Obtener un mensaje específico
router.get('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await messageService.getMessage(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Mensaje no encontrado'
      });
    }

    res.json({
      success: true,
      data: message
    });

  } catch (error) {
    console.error('Error obteniendo mensaje:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener mensaje'
    });
  }
});

// Eliminar un mensaje (solo para admin o el autor)
router.delete('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    
    // Aquí podrías añadir validación de permisos
    const deleted = await messageService.deleteMessage(messageId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Mensaje no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Mensaje eliminado'
    });

  } catch (error) {
    console.error('Error eliminando mensaje:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar mensaje'
    });
  }
});

module.exports = router;