import { ActorContext, createActor, openChannel, type ChannelTransmitter } from 'webactor';
import {
  ChatEvent,
  ChatEventPayload,
  ChatMessage,
  ChatUser,
  DEFAULT_ROOMS
} from './types';

export function createChatUIActor() {
  return createActor('chat-ui-actor', (context: ActorContext) => {
    let appElement: HTMLElement | null = null;
    let currentRoom = 'general';
    let currentUser: ChatUser | null = null;
    let messages: ChatMessage[] = [];
    let users: ChatUser[] = [];
    let typingUsers = new Set<string>();
    let connectionStatus: 'connected' | 'connecting' | 'disconnected' = 'connecting';
    let typingTimeout: number | null = null;
    let channel: ChannelTransmitter | null = null;

    const generateUserId = () => Math.random().toString(36).substring(2, 11);

    const generateUserName = () => {
      const adjectives = ['Happy', 'Clever', 'Bright', 'Swift', 'Gentle', 'Brave', 'Kind', 'Smart'];
      const nouns = ['Cat', 'Dog', 'Bird', 'Fox', 'Bear', 'Deer', 'Wolf', 'Lion'];
      const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      return `${adj}${noun}${Math.floor(Math.random() * 100)}`;
    };

    const initializeUser = async () => {
      currentUser = {
        id: generateUserId(),
        name: generateUserName(),
        joinedAt: Date.now()
      };

      try {
        // Open per-client channel to server via base actor link
        channel = await openChannel(context, { type: 'chat:open-channel' });

        // Listen for server messages over channel
        channel.addEventListener('message', (envelope) => {
          const message = envelope.data as ChatEventPayload;
          switch (message.type) {
            case ChatEvent.NEW_MESSAGE:
              messages.push(message.payload.message);
              if (messages.length > 1000) messages = messages.slice(-1000);
              updateMessages();
              break;
            case ChatEvent.USERS_UPDATE:
              users = message.payload.users.filter(u => u.id !== currentUser?.id);
              updateUsers();
              break;
            case ChatEvent.USER_TYPING:
              if (message.payload.userId !== currentUser?.id && message.payload.room === currentRoom) {
                typingUsers.add(message.payload.userName);
                updateTypingIndicator();
              }
              break;
            case ChatEvent.USER_STOP_TYPING: {
              const typingUser = users.find(u => u.id === message.payload.userId);
              if (typingUser && message.payload.room === currentRoom) {
                typingUsers.delete(typingUser.name);
                updateTypingIndicator();
              }
              break;
            }
            case ChatEvent.CONNECTION_STATUS:
              connectionStatus = message.payload.status;
              updateConnectionStatus();
              break;
          }
        });

        channel.addEventListener('error', () => {
          connectionStatus = 'disconnected';
          updateConnectionStatus();
        });

        // Announce user joined via channel
        channel.postMessage({
          type: ChatEvent.USER_JOIN,
          payload: { user: currentUser }
        });
      } catch (e) {
        connectionStatus = 'disconnected';
        updateConnectionStatus();
        console.error('Failed to open chat channel', e);
      }
    };

    const formatTime = (timestamp: number) => {
      return new Date(timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    };

    const createMessageElement = (message: ChatMessage) => {
      const isOwn = message.userId === currentUser?.id;
      const isSystem = message.userId === 'system';

      const messageDiv = document.createElement('div');
      messageDiv.className = `message-slide-in mb-4 ${isSystem ? 'text-center' : ''}`;

      if (isSystem) {
        messageDiv.innerHTML = `
          <div class="text-sm text-gray-500 italic">
            ${message.text}
          </div>
        `;
      } else {
        messageDiv.innerHTML = `
          <div class="message-bubble ${isOwn ? 'own bg-blue-500 text-white ml-auto' : 'other bg-white border'} p-3 rounded-lg shadow-sm">
            <div class="flex justify-between items-start mb-1">
              <span class="font-semibold text-sm ${isOwn ? 'text-blue-100' : 'text-gray-900'}">${message.userName}</span>
              <span class="text-xs ${isOwn ? 'text-blue-200' : 'text-gray-500'} ml-2">${formatTime(message.timestamp)}</span>
            </div>
            <div class="text-sm">${message.text}</div>
          </div>
        `;
      }

      return messageDiv;
    };

    const updateMessages = () => {
      const messagesContainer = appElement?.querySelector('#messages-container');
      if (!messagesContainer) return;

      const roomMessages = messages.filter(m => m.room === currentRoom);
      
      messagesContainer.innerHTML = '';
      roomMessages.forEach(message => {
        messagesContainer.appendChild(createMessageElement(message));
      });

      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    const updateUsers = () => {
      const usersList = appElement?.querySelector('#users-list');
      if (!usersList) return;

      usersList.innerHTML = users.map(user => `
        <div class="flex items-center p-2 rounded-lg ${user.isTyping ? 'bg-yellow-50' : 'bg-gray-50'} mb-2">
          <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold mr-3 user-online ${user.isTyping ? 'user-typing' : ''}">
            ${user.name[0].toUpperCase()}
          </div>
          <div class="flex-1">
            <div class="font-medium text-sm text-gray-900">${user.name}</div>
            ${user.isTyping ? '<div class="text-xs text-yellow-600">typing...</div>' : ''}
          </div>
        </div>
      `).join('');
    };

    const updateConnectionStatus = () => {
      const statusElement = appElement?.querySelector('#connection-status');
      if (!statusElement) return;

      statusElement.className = `connection-status text-sm font-medium ${connectionStatus}`;
      
      const statusText = {
        connected: 'Connected',
        connecting: 'Connecting...',
        disconnected: 'Disconnected'
      }[connectionStatus];

      statusElement.textContent = statusText;
    };

    const updateTypingIndicator = () => {
      const typingContainer = appElement?.querySelector('#typing-indicator');
      if (!typingContainer) return;

      if (typingUsers.size > 0) {
        const typingUserNames = Array.from(typingUsers);
        const typingText = typingUserNames.length === 1 
          ? `${typingUserNames[0]} is typing...`
          : `${typingUserNames.slice(0, -1).join(', ')} and ${typingUserNames[typingUserNames.length - 1]} are typing...`;

        typingContainer.innerHTML = `
          <div class="flex items-center text-sm text-gray-500 italic p-2">
            <div class="flex space-x-1 mr-2">
              <div class="w-2 h-2 bg-gray-400 rounded-full typing-dots"></div>
              <div class="w-2 h-2 bg-gray-400 rounded-full typing-dots"></div>
              <div class="w-2 h-2 bg-gray-400 rounded-full typing-dots"></div>
            </div>
            ${typingText}
          </div>
        `;
      } else {
        typingContainer.innerHTML = '';
      }
    };

    const initDOM = () => {
      appElement = document.querySelector('#app');
      if (!appElement) return;

      appElement.innerHTML = `
        <div class="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
          <!-- Sidebar -->
          <div class="w-full lg:w-80 bg-white border-r border-gray-200 flex flex-col">
            <!-- Header -->
            <div class="p-4 border-b border-gray-200">
              <h1 class="text-xl font-bold text-gray-900 mb-2">Multi-Tab Chat</h1>
              <div id="connection-status" class="connection-status text-sm font-medium connecting">Connecting...</div>
            </div>

            <!-- Room Selection -->
            <div class="p-4 border-b border-gray-200">
              <label class="block text-sm font-medium text-gray-700 mb-2">Room</label>
              <select id="room-select" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                ${DEFAULT_ROOMS.map(room => 
                  `<option value="${room.id}" ${room.id === currentRoom ? 'selected' : ''}>${room.name}</option>`
                ).join('')}
              </select>
            </div>

            <!-- Online Users -->
            <div class="flex-1 p-4 overflow-y-auto">
              <h3 class="text-sm font-medium text-gray-700 mb-3">Online Users</h3>
              <div id="users-list" class="user-list space-y-2">
                <!-- Users will be populated here -->
              </div>
            </div>
          </div>

          <!-- Chat Area -->
          <div class="flex-1 flex flex-col">
            <!-- Messages Container -->
            <div class="flex-1 p-4 overflow-y-auto messages-container" id="messages-container">
              <!-- Messages will be populated here -->
            </div>

            <!-- Typing Indicator -->
            <div id="typing-indicator" class="px-4">
              <!-- Typing indicator will appear here -->
            </div>

            <!-- Message Input -->
            <div class="p-4 border-t border-gray-200 bg-white">
              <div class="flex space-x-3">
                <input 
                  type="text" 
                  id="message-input" 
                  placeholder="Type your message..." 
                  class="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxlength="500"
                >
                <button 
                  id="send-button" 
                  class="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors font-medium"
                  disabled
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      const messageInput = appElement.querySelector('#message-input') as HTMLInputElement;
      const sendButton = appElement.querySelector('#send-button') as HTMLButtonElement;
      const roomSelect = appElement.querySelector('#room-select') as HTMLSelectElement;

      const sendMessage = () => {
        const text = messageInput.value.trim();
        if (!text || !currentUser || !channel) return;

        channel.postMessage({
          type: ChatEvent.SEND_MESSAGE,
          payload: { text, room: currentRoom }
        });

        messageInput.value = '';
        sendButton.disabled = true;
        
        if (typingTimeout) {
          clearTimeout(typingTimeout);
          typingTimeout = null;
        }

        if (channel) channel.postMessage({
          type: ChatEvent.USER_STOP_TYPING,
          payload: { userId: currentUser.id, room: currentRoom }
        });
      };

      sendButton.addEventListener('click', sendMessage);

      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendMessage();
        }
      });

      messageInput.addEventListener('input', () => {
        const hasText = messageInput.value.trim().length > 0;
        sendButton.disabled = !hasText;

        if (!currentUser || !channel) return;

        if (hasText) {
          channel?.postMessage({
            type: ChatEvent.USER_TYPING,
            payload: { userId: currentUser.id, userName: currentUser.name, room: currentRoom }
          });

          if (typingTimeout) clearTimeout(typingTimeout);
          typingTimeout = window.setTimeout(() => {
            channel?.postMessage({
              type: ChatEvent.USER_STOP_TYPING,
              payload: { userId: currentUser!.id, room: currentRoom }
            });
          }, 2000);
        } else {
          if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
          }
          if (channel) channel.postMessage({
            type: ChatEvent.USER_STOP_TYPING,
            payload: { userId: currentUser.id, room: currentRoom }
          });
        }
      });

      roomSelect.addEventListener('change', () => {
        const newRoom = roomSelect.value;
        if (newRoom !== currentRoom) {
          currentRoom = newRoom;
          if (channel) channel.postMessage({
            type: ChatEvent.ROOM_CHANGE,
            payload: { room: currentRoom }
          });
          updateMessages();
        }
      });
    };

    // Graceful shutdown: notify server and close channel
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        try {
          if (currentUser && channel) {
            channel.postMessage({
              type: ChatEvent.USER_LEAVE,
              payload: { userId: currentUser.id }
            });
            channel.close();
          }
        } catch {}
      });
    }


    setTimeout(() => {
      initDOM();
      initializeUser();
    }, 50);
  });
}
