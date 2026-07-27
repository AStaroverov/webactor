export interface ChatUser {
  id: string;
  name: string;
  joinedAt: number;
  isTyping?: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  room: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
}

export const ChatEvent = {
  SEND_MESSAGE: 'SEND_MESSAGE',
  NEW_MESSAGE: 'NEW_MESSAGE',
  USER_JOIN: 'USER_JOIN',
  USER_LEAVE: 'USER_LEAVE',
  USER_TYPING: 'USER_TYPING',
  USER_STOP_TYPING: 'USER_STOP_TYPING',
  USERS_UPDATE: 'USERS_UPDATE',
  ROOM_CHANGE: 'ROOM_CHANGE',
  CONNECTION_STATUS: 'CONNECTION_STATUS',
} as const;

export type ChatEventType = typeof ChatEvent[keyof typeof ChatEvent];

export interface SendMessageEvent {
  type: typeof ChatEvent.SEND_MESSAGE;
  payload: {
    text: string;
    room: string;
  };
}

export interface NewMessageEvent {
  type: typeof ChatEvent.NEW_MESSAGE;
  payload: {
    message: ChatMessage;
  };
}

export interface UserJoinEvent {
  type: typeof ChatEvent.USER_JOIN;
  payload: {
    user: ChatUser;
  };
}

export interface UserLeaveEvent {
  type: typeof ChatEvent.USER_LEAVE;
  payload: {
    userId: string;
  };
}

export interface UserTypingEvent {
  type: typeof ChatEvent.USER_TYPING;
  payload: {
    userId: string;
    userName: string;
    room: string;
  };
}

export interface UserStopTypingEvent {
  type: typeof ChatEvent.USER_STOP_TYPING;
  payload: {
    userId: string;
    room: string;
  };
}

export interface UsersUpdateEvent {
  type: typeof ChatEvent.USERS_UPDATE;
  payload: {
    users: ChatUser[];
  };
}

export interface RoomChangeEvent {
  type: typeof ChatEvent.ROOM_CHANGE;
  payload: {
    room: string;
  };
}

export interface ConnectionStatusEvent {
  type: typeof ChatEvent.CONNECTION_STATUS;
  payload: {
    status: 'connected' | 'connecting' | 'disconnected';
  };
}

export type ChatEventPayload = 
  | SendMessageEvent
  | NewMessageEvent
  | UserJoinEvent
  | UserLeaveEvent
  | UserTypingEvent
  | UserStopTypingEvent
  | UsersUpdateEvent
  | RoomChangeEvent
  | ConnectionStatusEvent;

export interface ChatState {
  users: Map<string, ChatUser>;
  messages: ChatMessage[];
  rooms: ChatRoom[];
  currentRoom: string;
}

export const DEFAULT_ROOMS: ChatRoom[] = [
  { id: 'general', name: 'General', description: 'General discussion' },
  { id: 'random', name: 'Random', description: 'Random chat' },
  { id: 'tech', name: 'Tech', description: 'Technical discussions' },
  { id: 'games', name: 'Games', description: 'Gaming chat' },
];