const express = require('express');
const RoomService = require('../services/RoomService');
const UserService = require('../services/UserService');
const redisClient = require('../config/redis');
const { validateCreateRoom } = require('../utils/validators');

const router = express.Router();
const roomService = new RoomService(redisClient);
const userService = new UserService(redisClient);

// Obtener todas las salas públicas
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    
    let rooms;
    if (search) {
      rooms = await roomService.searchRooms(search);
    } else {
      rooms = await roomService.getPublicRooms();
    }

    // Obtener información adicional de cada sala
    const roomsWithInfo = await Promise.all(
      rooms.map(async (room) => {
        const userCount = await userService.countRoomUsers(room.id);
        return {
          ...room.toRedisObject(),
          userCount,
          isFull: userCount >= room.maxUsers
        };
      })
    );

    res.json({
      success: true,
      data: roomsWithInfo
    });

  } catch (error) {
    console.error('Error obteniendo salas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener salas'
    });
  }
});

// Obtener información de una sala específica
router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await roomService.getRoom(roomId);

    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Sala no encontrada'
      });
    }

    // Obtener usuarios y contador
    const users = await userService.getRoomUsers(roomId);
    const userCount = await userService.countRoomUsers(roomId);

    res.json({
      success: true,
      data: {
        ...room.toRedisObject(),
        users: users.map(u => ({
          id: u.id,
          username: u.username,
          isOnline: u.isOnline,
          joinedAt: u.joinedAt
        })),
        userCount,
        isFull: userCount >= room.maxUsers
      }
    });

  } catch (error) {
    console.error('Error obteniendo sala:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener sala'
    });
  }
});

// Crear una nueva sala
router.post('/', async (req, res) => {
  try {
    const validation = validateCreateRoom(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    const { name, description, isPrivate, maxUsers, createdBy } = req.body;

    const room = await roomService.createRoom({
      name: name.trim(),
      description: description?.trim() || '',
      isPrivate: isPrivate || false,
      maxUsers: maxUsers || 50,
      createdBy
    });

    res.status(201).json({
      success: true,
      data: room.toRedisObject(),
      message: 'Sala creada exitosamente'
    });

  } catch (error) {
    console.error('Error creando sala:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear sala'
    });
  }
});

// Actualizar una sala
router.put('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, description, maxUsers, isPrivate } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (maxUsers !== undefined) updateData.maxUsers = parseInt(maxUsers);
    if (isPrivate !== undefined) updateData.isPrivate = isPrivate;

    const updatedRoom = await roomService.updateRoom(roomId, updateData);

    if (!updatedRoom) {
      return res.status(404).json({
        success: false,
        error: 'Sala no encontrada'
      });
    }

    res.json({
      success: true,
      data: updatedRoom.toRedisObject(),
      message: 'Sala actualizada exitosamente'
    });

  } catch (error) {
    console.error('Error actualizando sala:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al actualizar sala'
    });
  }
});

// Eliminar una sala
router.delete('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const deleted = await roomService.deleteRoom(roomId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Sala no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Sala eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando sala:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar sala'
    });
  }
});

// Obtener usuarios de una sala
router.get('/:roomId/users', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    // Verificar que la sala existe
    const room = await roomService.getRoom(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Sala no encontrada'
      });
    }

    const users = await userService.getRoomUsers(roomId);

    res.json({
      success: true,
      data: users.map(u => ({
        id: u.id,
        username: u.username,
        isOnline: u.isOnline,
        joinedAt: u.joinedAt,
        lastSeen: u.lastSeen
      }))
    });

  } catch (error) {
    console.error('Error obteniendo usuarios de sala:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener usuarios'
    });
  }
});

module.exports = router;