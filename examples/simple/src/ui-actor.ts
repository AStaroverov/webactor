import { ActorContext, createActor } from 'webactor';

export interface UIMessage {
  type: 'UPDATE_DOM' | 'USER_ACTION';
  payload: any;
}

export function createUIActor() {
  return createActor('ui-actor', (context: ActorContext) => {
    let appElement: HTMLElement | null = null;

    // Initialize DOM
    const initDOM = () => {
      appElement = document.querySelector('#app');
      if (!appElement) return;

      appElement.innerHTML = `
        <div class="min-h-screen bg-gray-100 flex items-center justify-center">
          <div class="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
            <h1 class="text-2xl font-bold text-center mb-6">Actor Demo</h1>
            
            <div class="text-center mb-6">
              <div class="text-4xl font-mono text-blue-600 mb-2" id="counter">0</div>
              <div class="text-sm text-gray-500">Current Count</div>
            </div>
            
            <div class="flex gap-4 justify-center">
              <button 
                id="increment-btn" 
                class="px-6 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
              >
                Increment
              </button>
              <button 
                id="decrement-btn" 
                class="px-6 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Decrement
              </button>
            </div>
            
            <div class="mt-6 p-4 bg-gray-50 rounded">
              <h3 class="font-semibold mb-2">Actor Messages:</h3>
              <div id="message-log" class="text-sm text-gray-600 max-h-32 overflow-y-auto">
                UI Actor initialized
              </div>
            </div>
          </div>
        </div>
      `;

      // Setup event listeners - this is the ONLY non-actor code interaction
      const incrementBtn = appElement.querySelector('#increment-btn');
      const decrementBtn = appElement.querySelector('#decrement-btn');

      incrementBtn?.addEventListener('click', () => {
        // Send user action to business logic actor
        context.postMessage({
          type: 'USER_ACTION',
          payload: { action: 'INCREMENT' }
        });
      });

      decrementBtn?.addEventListener('click', () => {
        // Send user action to business logic actor  
        context.postMessage({
          type: 'USER_ACTION',
          payload: { action: 'DECREMENT' }
        });
      });
    };

    // Update DOM based on messages
    const updateDOM = (data: any) => {
      if (!appElement) return;

      const counterEl = appElement.querySelector('#counter');
      const logEl = appElement.querySelector('#message-log');

      if (counterEl && typeof data.counter === 'number') {
        counterEl.textContent = data.counter.toString();
      }

      if (logEl && data.message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'mb-1 text-xs';
        logEntry.textContent = `[${timestamp}] ${data.message}`;
        logEl.appendChild(logEntry);
        logEl.scrollTop = logEl.scrollHeight;
      }
    };

    // Handle incoming messages
    context.addEventListener('message', (event) => {
      const message = event.data as UIMessage;

      switch (message.type) {
        case 'UPDATE_DOM':
          updateDOM(message.payload);
          break;

        case 'USER_ACTION':
          // Forward user actions to business logic (this will be handled by connected actor)
          // The UI actor just passes through user actions
          break;
      }
    });

    // Initialize DOM when actor is created
    setTimeout(initDOM, 0);

    // Log that UI actor is ready
    setTimeout(() => {
      updateDOM({ message: 'UI Actor ready, waiting for connections...' });
    }, 100);
  });
}