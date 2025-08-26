import { ActorContext, createActor, supportChannel, type ChannelTransmitter } from 'webactor';
import {
  ChatEvent,
  ChatEventPayload,
  ChatMessage,
  ChatState,
  ChatUser,
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

    // Per-client channels (one per tab)
    const clients = new Map<string, { channel: ChannelTransmitter; userId?: string }>();

    const generateId = () => Math.random().toString(36).substring(2, 11);

    const broadcastToAll = (event: ChatEventPayload, exceptId?: string) => {
      for (const [id, { channel }] of clients) {
        if (id === exceptId) continue;
        try { channel.postMessage(event); } catch { }
      }
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

    // Accept channel requests and handle per-client messages
    context.addEventListener('message', async (envelope) => {
      const data: any = envelope.data;

      // Channel handshake request from client
      if (data && data.type === 'chat:open-channel') {
        const connectionId = generateId();
        try {
          const channel = await supportChannel(context, envelope as any);
          clients.set(connectionId, { channel });

          // Inform this client only
          try {
            channel.postMessage({
              type: ChatEvent.CONNECTION_STATUS,
              payload: { status: 'connected' }
            });
          } catch { }

          // Listen for messages from this client
          channel.addEventListener('message', (envelope) => {
            const message = envelope.data as ChatEventPayload;
            switch (message.type) {
              case ChatEvent.SEND_MESSAGE: {
                const { text, room } = message.payload;
                const userId = Array.from(state.users.keys()).find(uid => uid === clients.get(connectionId)?.userId);
                if (!userId || !text.trim()) return;
                setUserTyping(userId, room, false);
                addMessage(userId, text, room);
                break;
              }
              case ChatEvent.USER_JOIN: {
                const { user } = message.payload;
                clients.set(connectionId, { channel, userId: user.id });
                addUser(user);
                // System message about join
                const joinMsg: ChatMessage = {
                  id: generateId(),
                  userId: 'system',
                  userName: 'System',
                  text: `${user.name} joined the chat`,
                  timestamp: Date.now(),
                  room: state.currentRoom
                };
                state.messages.push(joinMsg);
                broadcastToAll({ type: ChatEvent.NEW_MESSAGE, payload: { message: joinMsg } });
                break;
              }
              case ChatEvent.USER_LEAVE: {
                const { userId } = message.payload;
                const user = state.users.get(userId);
                if (user) {
                  const leaveMsg: ChatMessage = {
                    id: generateId(),
                    userId: 'system',
                    userName: 'System',
                    text: `${user.name} left the chat`,
                    timestamp: Date.now(),
                    room: state.currentRoom
                  };
                  state.messages.push(leaveMsg);
                  broadcastToAll({ type: ChatEvent.NEW_MESSAGE, payload: { message: leaveMsg } });
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
                // ignore
                break;
              }
              default:
                console.warn('Unknown chat event type from channel:', (message as any).type);
            }
          });

          // Handle channel termination (client/tab closed or lost)
          channel.addEventListener('error', () => {
            const info = clients.get(connectionId);
            clients.delete(connectionId);
            if (info?.userId) {
              const user = state.users.get(info.userId);
              removeUser(info.userId);
              if (user) {
                const leaveMsg: ChatMessage = {
                  id: generateId(),
                  userId: 'system',
                  userName: 'System',
                  text: `${user.name} left the chat`,
                  timestamp: Date.now(),
                  room: state.currentRoom
                };
                state.messages.push(leaveMsg);
                broadcastToAll({ type: ChatEvent.NEW_MESSAGE, payload: { message: leaveMsg } });
              }
            }
          });
        } catch (err) {
          console.warn('Failed to support chat channel:', err);
        }
        return;
      }
    });

    // Optionally, server can push a periodic status/welcome when at least one client connects
    // Here we keep state.welcome in memory and broadcast on first user join via the channel handler above.
  });
}