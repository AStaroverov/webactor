import { createActor, ActorContext } from 'webactor';
import { 
  ChatMessage, 
  ChatUser, 
  ChatState, 
  ChatEventPayload, 
  ChatEvent,
  DEFAULT_ROOMS
} from './types';

export function createChatServerActor() {
  return createActor('chat-server-actor', (context: ActorContext) => {
    const state: ChatState = {
      users: new Map(),
      messages: [],
      rooms: [...DEFAULT_ROOMS],
      currentRoom: 'general'
    };

    const generateId = () => Math.random().toString(36).substring(2, 11);

    const broadcastToAll = (event: ChatEventPayload) => {
      context.postMessage(event);
    };

    const addMessage = (userId: string, text: string, room: string) => {
      const user = state.users.get(userId);
      if (!user) return;

      const message: ChatMessage = {
        id: generateId(),
        userId,
        userName: user.name,
        text: text.trim(),
        timestamp: Date.now(),
        room
      };

      state.messages.push(message);

      if (state.messages.length > 100) {
        state.messages = state.messages.slice(-100);
      }

      broadcastToAll({
        type: ChatEvent.NEW_MESSAGE,
        payload: { message }
      });
    };

    const addUser = (user: ChatUser) => {
      state.users.set(user.id, user);
      
      broadcastToAll({
        type: ChatEvent.USER_JOIN,
        payload: { user }
      });

      broadcastToAll({
        type: ChatEvent.USERS_UPDATE,
        payload: { users: Array.from(state.users.values()) }
      });
    };

    const removeUser = (userId: string) => {
      const user = state.users.get(userId);
      if (!user) return;

      state.users.delete(userId);

      broadcastToAll({
        type: ChatEvent.USER_LEAVE,
        payload: { userId }
      });

      broadcastToAll({
        type: ChatEvent.USERS_UPDATE,
        payload: { users: Array.from(state.users.values()) }
      });
    };

    const setUserTyping = (userId: string, room: string, isTyping: boolean) => {
      const user = state.users.get(userId);
      if (!user) return;

      user.isTyping = isTyping;
      state.users.set(userId, user);

      if (isTyping) {
        broadcastToAll({
          type: ChatEvent.USER_TYPING,
          payload: {
            userId,
            userName: user.name,
            room
          }
        });
      } else {
        broadcastToAll({
          type: ChatEvent.USER_STOP_TYPING,
          payload: {
            userId,
            room
          }
        });
      }
    };

    context.addEventListener('message', (event) => {
      const message = event.data as ChatEventPayload;

      switch (message.type) {
        case ChatEvent.SEND_MESSAGE: {
          const { text, room } = message.payload;
          
          const userId = Array.from(state.users.keys())[0];
          if (!userId || !text.trim()) return;

          setUserTyping(userId, room, false);
          addMessage(userId, text, room);
          break;
        }

        case ChatEvent.USER_JOIN: {
          const { user } = message.payload;
          addUser(user);

          // Send connection status to the new user
          broadcastToAll({
            type: ChatEvent.CONNECTION_STATUS,
            payload: { status: 'connected' }
          });

          context.postMessage({
            type: ChatEvent.NEW_MESSAGE,
            payload: {
              message: {
                id: generateId(),
                userId: 'system',
                userName: 'System',
                text: `${user.name} joined the chat`,
                timestamp: Date.now(),
                room: state.currentRoom
              }
            }
          });
          break;
        }

        case ChatEvent.USER_LEAVE: {
          const { userId } = message.payload;
          const user = state.users.get(userId);
          
          if (user) {
            context.postMessage({
              type: ChatEvent.NEW_MESSAGE,
              payload: {
                message: {
                  id: generateId(),
                  userId: 'system',
                  userName: 'System',
                  text: `${user.name} left the chat`,
                  timestamp: Date.now(),
                  room: state.currentRoom
                }
              }
            });
          }

          removeUser(userId);
          break;
        }

        case ChatEvent.USER_TYPING: {
          const { userId, room } = message.payload;
          setUserTyping(userId, room, true);
          break;
        }

        case ChatEvent.USER_STOP_TYPING: {
          const { userId, room } = message.payload;
          setUserTyping(userId, room, false);
          break;
        }

        case ChatEvent.ROOM_CHANGE: {
          const { room } = message.payload;
          if (state.rooms.find(r => r.id === room)) {
            state.currentRoom = room;
          }
          break;
        }

        case ChatEvent.CONNECTION_STATUS: {
          break;
        }

        default:
          console.warn('Unknown chat event type:', (message as any).type);
      }
    });

    setTimeout(() => {
      broadcastToAll({
        type: ChatEvent.CONNECTION_STATUS,
        payload: { status: 'connected' }
      });

      const welcomeMessage: ChatMessage = {
        id: generateId(),
        userId: 'system',
        userName: 'System',
        text: 'Welcome to the multi-tab chat! Try opening this page in multiple tabs to see real-time synchronization.',
        timestamp: Date.now(),
        room: 'general'
      };

      state.messages.push(welcomeMessage);

      broadcastToAll({
        type: ChatEvent.NEW_MESSAGE,
        payload: { message: welcomeMessage }
      });
    }, 100);
  });
}