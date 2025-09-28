// Variables globales
let socket = null;
let currentUserId = null;
let currentUsername = null;
let currentRoomId = null;
let typingTimer = null;
let isTyping = false;

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', () => {
    initializeSocketConnection();
    setupEventListeners();
    loadRooms();
});

// Configurar conexión Socket.io
function initializeSocketConnection() {
    socket = io();

    // Eventos de conexión
    socket.on('connect', () => {
        console.log('Conectado al servidor');
    });

    socket.on('disconnect', () => {
        console.log('Desconectado del servidor');
        showError('Conexión perdida con el servidor');
    });

    // Eventos de usuario
    socket.on('user:joined', (data) => {
        console.log('Usuario conectado:', data);
        currentUserId = data.userId;
        currentUsername = data.username;
        document.getElementById('currentUsername').textContent = currentUsername;
        document.getElementById('loginContainer').classList.add('hidden');
    });

    // Eventos de sala
    socket.on('room:joined', (data) => {
        console.log('Unido a sala:', data);
        currentRoomId = data.roomId;
        document.getElementById('currentRoomName').textContent = data.roomName;
        document.getElementById('roomUserCount').textContent = `${data.userCount} usuarios`;
        
        // Limpiar mensajes y cargar los nuevos
        clearMessages();
        data.messages.forEach(message => displayMessage(message));
        
        // Habilitar input de mensajes
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendButton').disabled = false;
        
        // Actualizar lista de salas
        updateRoomActiveState(data.roomId);
    });

    // Eventos de mensajes
    socket.on('message:new', (message) => {
        displayMessage(message);
        scrollToBottom();
    });

    // Eventos de usuarios entrando/saliendo
    socket.on('user:entered', (data) => {
        document.getElementById('roomUserCount').textContent = `${data.userCount} usuarios`;
    });

    socket.on('user:left', (data) => {
        document.getElementById('roomUserCount').textContent = `${data.userCount} usuarios`;
    });

    // Eventos de escritura
    socket.on('user:typing', (data) => {
        showTypingIndicator(`${data.username} está escribiendo...`);
    });

    socket.on('user:stopped_typing', (data) => {
        hideTypingIndicator();
    });

    // Eventos de error
    socket.on('error', (data) => {
        showError(data.message);
    });
}

// Configurar event listeners
function setupEventListeners() {
    // Enter para enviar mensaje
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        } else {
            handleTyping();
        }
    });

    // Enter para unirse
    document.getElementById('usernameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinChat();
        }
    });

    // Enter para crear sala
    document.getElementById('newRoomName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            createRoom();
        }
    });

    // Detectar cuando para de escribir
    document.getElementById('messageInput').addEventListener('input', handleTyping);
}

// Unirse al chat
function joinChat() {
    const username = document.getElementById('usernameInput').value.trim();
    
    if (!username) {
        showError('Por favor ingresa un nombre de usuario');
        return;
    }

    if (username.length > 50) {
        showError('El nombre de usuario es muy largo (máximo 50 caracteres)');
        return;
    }

    socket.emit('user:join', { username });
}

// Cargar lista de salas
async function loadRooms() {
    try {
        const response = await fetch('/api/rooms');
        const data = await response.json();
        
        if (data.success) {
            displayRooms(data.data);
        } else {
            showError('Error cargando salas');
        }
    } catch (error) {
        console.error('Error cargando salas:', error);
        showError('Error de conexión');
    }
}

// Mostrar salas en la lista
function displayRooms(rooms) {
    const roomsList = document.getElementById('roomsList');
    roomsList.innerHTML = '';

    rooms.forEach(room => {
        const roomItem = document.createElement('li');
        roomItem.className = 'room-item';
        roomItem.setAttribute('data-room-id', room.id);
        roomItem.innerHTML = `
            <div><strong>${room.name}</strong></div>
            <div style="font-size: 12px; opacity: 0.8;">${room.userCount}/${room.maxUsers} usuarios</div>
        `;
        roomItem.onclick = () => joinRoom(room.id, room.name);
        roomsList.appendChild(roomItem);
    });
}

// Unirse a una sala
function joinRoom(roomId, roomName) {
    if (!currentUserId) {
        showError('Debes conectarte primero');
        return;
    }

    socket.emit('room:join', { roomId });
}

// Crear nueva sala
async function createRoom() {
    const roomName = document.getElementById('newRoomName').value.trim();
    
    if (!roomName) {
        showError('Por favor ingresa un nombre para la sala');
        return;
    }

    if (!currentUserId) {
        showError('Debes conectarte primero');
        return;
    }

    try {
        const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: roomName,
                createdBy: currentUserId
            })
        });

        const data = await response.json();
        
        if (data.success) {
            document.getElementById('newRoomName').value = '';
            loadRooms(); // Recargar lista de salas
            joinRoom(data.data.id, data.data.name); // Unirse automáticamente
        } else {
            showError(data.error || 'Error creando sala');
        }
    } catch (error) {
        console.error('Error creando sala:', error);
        showError('Error de conexión');
    }
}

// Enviar mensaje
function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const content = messageInput.value.trim();
    
    if (!content) {
        return;
    }

    if (!currentRoomId) {
        showError('Debes estar en una sala para enviar mensajes');
        return;
    }

    socket.emit('message:send', { content });
    messageInput.value = '';
    
    // Parar indicador de escritura
    if (isTyping) {
        socket.emit('typing:stop');
        isTyping = false;
    }
}

// Mostrar mensaje en el chat
function displayMessage(message) {
    const messagesContainer = document.getElementById('messagesContainer');
    
    // Si el contenedor está vacío, limpiar mensaje inicial
    if (messagesContainer.children.length === 1 && 
        messagesContainer.children[0].style.textAlign === 'center') {
        messagesContainer.innerHTML = '';
    }

    const messageElement = document.createElement('div');
    
    if (message.type === 'system') {
        messageElement.className = 'message system';
        messageElement.innerHTML = `<div class="message-content">${escapeHtml(message.content)}</div>`;
    } else {
        const isOwnMessage = message.userId === currentUserId;
        messageElement.className = `message ${isOwnMessage ? 'own' : 'other'}`;
        
        const timestamp = new Date(message.timestamp).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageElement.innerHTML = `
            <div class="message-header">
                ${isOwnMessage ? 'Tú' : escapeHtml(message.username)} - ${timestamp}
            </div>
            <div class="message-content">${escapeHtml(message.content)}</div>
        `;
    }
    
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
}

// Limpiar mensajes
function clearMessages() {
    document.getElementById('messagesContainer').innerHTML = '';
}

// Scroll al final
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

// Manejar indicador de escritura
function handleTyping() {
    if (!currentRoomId) return;

    if (!isTyping) {
        socket.emit('typing:start');
        isTyping = true;
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        socket.emit('typing:stop');
        isTyping = false;
    }, 1000);
}

// Mostrar indicador de escritura
function showTypingIndicator(text) {
    const indicator = document.getElementById('typingIndicator');
    indicator.textContent = text;
    indicator.classList.remove('hidden');
}

// Ocultar indicador de escritura
function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    indicator.classList.add('hidden');
}

// Actualizar estado activo de sala
function updateRoomActiveState(activeRoomId) {
    document.querySelectorAll('.room-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-room-id') === activeRoomId) {
            item.classList.add('active');
        }
    });
}

// Mostrar error
function showError(message) {
    // Simple alert por ahora, puedes mejorarlo con un toast
    alert('Error: ' + message);
}

// Escapar HTML para prevenir XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}