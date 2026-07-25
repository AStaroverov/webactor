export const DEVTOOLS_ENVELOPE_TYPE = '__webactor_devtools__';
export const DEVTOOLS_HOOK_KEY = '__WEBACTOR_DEVTOOLS_HOOK__';
export const DEVTOOLS_GLOBAL_KEY = '__WEBACTOR_DEVTOOLS__';

export const DevtoolsBridgeMessage = {
    Attach: 'attach',
    Attached: 'attached',
    Events: 'events',
} as const;
