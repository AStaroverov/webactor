# Multi-Tab Chat Application

A real-time chat application built with the Actorr library that synchronizes across multiple browser tabs using SharedWorkers.

## Features

- **Multi-tab synchronization**: Messages and user presence sync across all open tabs
- **Real-time communication**: Instant message delivery and typing indicators
- **Multiple chat rooms**: Switch between different chat rooms (General, Random, Tech, Games)
- **User management**: Automatic user generation and online status tracking
- **Modern UI**: Responsive design with Tailwind CSS and smooth animations
- **Browser compatibility**: Graceful fallback for unsupported browsers

## Architecture

### Main Thread (UI)
- **UI Actor** (`chat-ui-actor.ts`) - Handles DOM interactions and user input
- **connectActorToWorker** - Connects UI Actor to SharedWorker

### SharedWorker
- **Chat Server Actor** (`chat-server-actor.ts`) - Manages chat state (users, messages, rooms)
- **onConnectMessagePort** - Handles connections from main thread
- **connectActorToMessagePort** - Connects Chat Server Actor to each port

## Data Flow

### Sending a Message
1. User types text in UI
2. UI Actor sends `ChatEvent.SEND_MESSAGE` with `{ text: "hello", room: "general" }`
3. `connectActorToWorker` transmits through SharedWorker port
4. `onConnectMessagePort` receives the message
5. `connectActorToMessagePort` forwards to Chat Server Actor
6. Chat Server Actor processes in message handler
7. Creates `ChatMessage` object
8. Saves to `state.messages`
9. Broadcasts `ChatEvent.NEW_MESSAGE` with `{ message: ChatMessage }`
10. `connectActorToMessagePort` sends back through all ports
11. `connectActorToWorker` delivers to all UI Actors
12. UI Actors receive `ChatEvent.NEW_MESSAGE`
13. Add message to local `messages` array
14. Call `updateMessages()` to update DOM

### Multi-tab Synchronization
- SharedWorker supports multiple connections automatically
- Each tab creates its own port through `onConnectMessagePort`
- Chat Server Actor receives one message, broadcasts to all ports
- All tabs receive identical messages synchronously

## File Structure

```
src/
├── types.ts                 # Type definitions and events
├── chat-server-actor.ts     # Server-side chat logic
├── chat-server.worker.ts    # SharedWorker implementation
├── chat-ui-actor.ts         # Client-side UI logic
├── main.ts                  # Application entry point
└── style.css                # Tailwind CSS styles
```

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open multiple tabs:**
   - Navigate to `http://localhost:3000`
   - Open the same URL in multiple tabs
   - Start chatting and see real-time synchronization

## Key Components

### Chat Events
- `SEND_MESSAGE`: User sends a message
- `NEW_MESSAGE`: New message broadcast
- `USER_JOIN`/`USER_LEAVE`: User presence updates
- `USER_TYPING`/`USER_STOP_TYPING`: Typing indicators
- `USERS_UPDATE`: User list synchronization
- `ROOM_CHANGE`: Switch chat rooms
- `CONNECTION_STATUS`: Connection state updates

### Actor Communication
- **UI Actor**: Manages DOM and user interactions
- **Server Actor**: Handles business logic and state
- **SharedWorker**: Enables multi-tab communication
- **Message Ports**: Connect actors across contexts

## Browser Support

Requires modern browsers with SharedWorker support:
- Chrome 4+
- Firefox 29+
- Safari 16+ (partial support)

Falls back gracefully on unsupported browsers with helpful error messages.

## Development

The application uses:
- **Actorr**: Actor-based architecture
- **TypeScript**: Type-safe development
- **Vite**: Fast build tooling
- **Tailwind CSS**: Utility-first styling
- **SharedWorkers**: Multi-tab synchronization

To modify the chat:
1. Edit message types in `types.ts`
2. Update server logic in `chat-server-actor.ts`
3. Modify UI behavior in `chat-ui-actor.ts`
4. Style changes in `style.css`

## Demo Instructions

1. Open the application in one tab
2. Open the same URL in additional tabs
3. Send messages from any tab
4. Switch between rooms to see room-specific messages
5. Notice typing indicators and user presence
6. Close tabs to see users leave automatically