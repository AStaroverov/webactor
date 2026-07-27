import { createDenseNetwork } from 'webactor';
import { createChatUIActor } from './chat-ui-actor';
import './style.css';

async function bootstrap() {
  console.log('🚀 Starting multi-tab chat application...');

  try {
    const uiActor = createChatUIActor();

    const worker = new SharedWorker(
      new URL('./chat-server.worker.ts', import.meta.url),
      { type: 'module' }
    );

    const network = createDenseNetwork(
      uiActor,
      worker
    );

    network.launch();

    console.log('✅ Chat application running');
    console.log('- UI Actor: handles DOM interactions and user input');
    console.log('- SharedWorker: manages chat state across all tabs');
    console.log('- Multi-tab sync: messages and users synchronized in real-time');

    window.addEventListener('beforeunload', () => {
      console.log('🧹 Shutting down chat application...');

      try {
        network.close();
      } catch (error) {
        console.warn('Cleanup error:', error);
      }
    });

    window.addEventListener('error', (event) => {
      console.error('🚨 Application error:', event.error);
    });
  } catch (error) {
    console.error('💥 Failed to start chat application:', error);

    const app = document.querySelector('#app');
    if (app) {
      app.innerHTML = `
        <div class="min-h-screen bg-red-50 flex items-center justify-center">
          <div class="bg-white p-8 rounded-lg shadow-lg max-w-md">
            <div class="text-center mb-6">
              <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <h1 class="text-xl font-bold text-red-600 mb-2">Chat Startup Error</h1>
              <p class="text-gray-700 mb-4">Failed to initialize the chat application.</p>
            </div>
            
            <div class="bg-gray-50 p-4 rounded-lg mb-4">
              <pre class="text-sm text-gray-800 overflow-auto max-h-32">
${error instanceof Error ? error.message : String(error)}
              </pre>
            </div>
            
            <div class="text-center">
              <button 
                onclick="location.reload()" 
                class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors font-medium"
              >
                Try Again
              </button>
            </div>
            
            <div class="mt-4 text-center">
              <p class="text-xs text-gray-500">
                This chat application requires SharedWorker support and modern browser features.
              </p>
            </div>
          </div>
        </div>
      `;
    }
  }
}

if ('serviceWorker' in navigator && 'SharedWorker' in window) {
  bootstrap();
} else {
  const app = document.querySelector('#app');
  if (app) {
    app.innerHTML = `
      <div class="min-h-screen bg-yellow-50 flex items-center justify-center">
        <div class="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <div class="text-center mb-6">
            <div class="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <h1 class="text-xl font-bold text-yellow-600 mb-2">Browser Not Supported</h1>
            <p class="text-gray-700 mb-4">This chat application requires a modern browser with SharedWorker support.</p>
          </div>
          
          <div class="text-center">
            <p class="text-sm text-gray-600 mb-4">
              Please use Chrome, Firefox, or another modern browser to experience multi-tab chat synchronization.
            </p>
            <a 
              href="https://caniuse.com/sharedworkers" 
              target="_blank" 
              rel="noopener noreferrer"
              class="inline-block px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium"
            >
              Check Browser Support
            </a>
          </div>
        </div>
      </div>
    `;
  }
}