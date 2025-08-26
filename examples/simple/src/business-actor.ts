import { createActor, ActorContext } from 'webactor';

export interface BusinessMessage {
  type: 'USER_ACTION' | 'RESET' | 'GET_STATE';
  payload: any;
}

export function createBusinessActor() {
  return createActor('business-actor', (context: ActorContext) => {
    // Business state
    let counter = 0;
    let history: Array<{ action: string; value: number; timestamp: number }> = [];

    // Business logic functions
    const increment = () => {
      counter += 1;
      logAction('INCREMENT', counter);
      notifyUI();
    };

    const decrement = () => {
      counter -= 1;
      logAction('DECREMENT', counter);
      notifyUI();
    };

    const reset = () => {
      counter = 0;
      history = [];
      logAction('RESET', counter);
      notifyUI();
    };

    const logAction = (action: string, value: number) => {
      history.push({
        action,
        value,
        timestamp: Date.now()
      });

      // Keep only last 10 actions
      if (history.length > 10) {
        history = history.slice(-10);
      }
    };

    const notifyUI = () => {
      // Send updated state to UI actor
      context.postMessage({
        type: 'UPDATE_DOM',
        payload: {
          counter,
          message: `Business: Counter = ${counter} (${history[history.length - 1]?.action || 'INIT'})`
        }
      });
    };

    // Handle incoming messages
    context.addEventListener('message', (event) => {
      const message: BusinessMessage = event.data;

      switch (message.type) {
        case 'USER_ACTION':
          const { action } = message.payload;
          
          switch (action) {
            case 'INCREMENT':
              increment();
              break;
            case 'DECREMENT':
              decrement();
              break;
            case 'RESET':
              reset();
              break;
            default:
              // Send error to UI
              context.postMessage({
                type: 'UPDATE_DOM',
                payload: {
                  message: `Business: Unknown action "${action}"`
                }
              });
          }
          break;

        case 'RESET':
          reset();
          break;

        case 'GET_STATE':
          // Send current state
          context.postMessage({
            type: 'UPDATE_DOM',
            payload: {
              counter,
              history: history.slice(),
              message: `Business: Current state - Counter: ${counter}, History: ${history.length} actions`
            }
          });
          break;

        default:
          context.postMessage({
            type: 'UPDATE_DOM',
            payload: {
              message: `Business: Unknown message type "${message.type}"`
            }
          });
      }
    });

    // Initialize business logic
    setTimeout(() => {
      context.postMessage({
        type: 'UPDATE_DOM',
        payload: {
          counter: 0,
          message: 'Business: Actor initialized, ready to process actions'
        }
      });
    }, 50);

    // Optional: Auto-increment demo every 5 seconds
    const autoDemo = () => {
      setTimeout(() => {
        if (counter < 3) {
          increment();
          context.postMessage({
            type: 'UPDATE_DOM',
            payload: {
              message: 'Business: Auto-demo increment'
            }
          });
          autoDemo();
        }
      }, 5000);
    };

    // Start auto-demo after initial setup
    setTimeout(autoDemo, 2000);
  });
}