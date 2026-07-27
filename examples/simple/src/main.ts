import './style.css';

import { connectActors } from 'webactor';
import { createBusinessActor } from './business-actor';
import { createUIActor } from './ui-actor';

// ==========================================
// SYSTEM BOOTSTRAP CODE (ONLY NON-ACTOR CODE)
// ==========================================

async function bootstrap() {
  console.log('🚀 Bootstrapping actor system...');

  // Create actors
  const uiActor = createUIActor();
  const businessActor = createBusinessActor();

  // Connect actors: UI ↔ Business  
  const disconnect = connectActors(uiActor, businessActor);

  // Launch actors
  uiActor.launch();
  businessActor.launch();

  console.log('✅ Actor system running');
  console.log('- UI Actor: handles DOM updates and user interactions');
  console.log('- Business Actor: handles counter logic and state');
  console.log('- Connection: bidirectional message passing');

  // System cleanup on page unload
  window.addEventListener('beforeunload', () => {
    console.log('🧹 Shutting down actor system...');
    
    try {
      disconnect();
      uiActor.close();
      businessActor.close();
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  });

  // Optional: Global error handler for actors
  window.addEventListener('error', (event) => {
    console.error('🚨 System error:', event.error);
  });

  // Optional: Performance monitoring
  if (import.meta.env.DEV) {
    // Development mode: add some debugging helpers
    (window as any).__ACTORS__ = {
      ui: uiActor,
      business: businessActor,
      disconnect
    };

    console.log('🔧 Development mode: actors available on window.__ACTORS__');
  }
}

// ==========================================
// SYSTEM ENTRY POINT
// ==========================================

bootstrap().catch((error) => {
  console.error('💥 Bootstrap failed:', error);
  
  // Fallback: show error in DOM
  const app = document.querySelector('#app');
  if (app) {
    app.innerHTML = `
      <div class="min-h-screen bg-red-100 flex items-center justify-center">
        <div class="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h1 class="text-xl font-bold text-red-600 mb-4">System Error</h1>
          <p class="text-gray-700">Failed to start actor system.</p>
          <pre class="mt-4 p-4 bg-gray-100 rounded text-sm overflow-auto">
            ${error.message}
          </pre>
          <button 
            onclick="location.reload()" 
            class="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    `;
  }
});