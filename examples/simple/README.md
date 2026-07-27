# Actorr Library Demo

Interactive web application demonstrating all public APIs of the Actorr library.

## Features Demonstrated

### ✅ All Public APIs Used
- **`createActor()`** - Creates various types of actors (Counter, PingPong, DataProcessor, Logger)  
- **`createRetranslator()`** - Creates message relay chains
- **`createDenseNetwork()`** - Creates fully connected actor networks
- **`connectActors()`** - Establishes point-to-point connections
- **UI Actor Pattern** - The entire UI is controlled by an actor

### 🎯 Interactive Demos

1. **Basic Actors**
   - Counter Actor: Demonstrates state management and message handling
   - Increment/decrement operations with visual feedback

2. **Connected Actors** 
   - Ping-Pong pair: Shows bidirectional communication
   - Realistic message delays and sequence counting

3. **Retranslator Chain**
   - Data Processor → Retranslator → Logger chain
   - Demonstrates message forwarding and processing pipeline

4. **Dense Network**
   - Fully connected network of 3 actors
   - All actors can communicate with all other actors
   - Broadcast messaging demonstration

### 🎨 Visual Features

- **Real-time Network Visualization**
  - Actor status indicators (idle/active/destroyed)
  - Connection lines with activity highlighting  
  - Message count tracking
  - Grid layout for easy viewing

- **Live Message Log**
  - All inter-actor messages logged in real-time
  - Timestamp and payload information
  - Auto-scrolling with message limit

- **Interactive Controls**
  - Button-driven demos
  - State-aware UI (buttons enable/disable based on context)
  - Clean all functionality

## Architecture

The demo itself is built using the actor pattern:

```
UI Actor (controls DOM updates)
    ↕ 
Main Thread (user interactions)
    ↕
Demo Actors (Counter, PingPong, DataProcessor, Logger)
    ↕
Retranslators & Networks
```

All UI updates go through the UI Actor, making the entire application reactive and following the actor model consistently.

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production  
npm run build
```

## Usage Examples

The demo shows practical usage of each API:

### Creating and Connecting Actors
```typescript
const actor1 = createActor('ping', (context) => {
  context.addEventListener('message', (event) => {
    // Handle messages
  });
});

const actor2 = createActor('pong', (context) => {
  // Actor logic
});

const disconnect = connectActors(actor1, actor2);
```

### Using Retranslators
```typescript
const retranslator = createRetranslator({ name: 'relay' });
const disconnect1 = connectActors(source, retranslator);  
const disconnect2 = connectActors(retranslator, target);
```

### Dense Networks
```typescript
const network = createDenseNetwork(actor1, actor2, actor3);
network.launch(); // All actors launched and connected
// All actors can now communicate with each other
```

## Technologies Used

- **Vite** - Fast build tool and dev server
- **TypeScript** - Type safety and better DX  
- **Tailwind CSS** - Utility-first styling
- **Actorr Library** - Actor model implementation

The demo proves that complex interactive applications can be built entirely using the actor model, with clean separation of concerns and reactive data flow.