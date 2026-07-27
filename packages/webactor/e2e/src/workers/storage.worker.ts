import type { AnyEnvelope } from 'webactor';
import { createActor, createDenseNetwork, response, useContextMessagePort } from 'webactor';

const storage = createActor('storage', (context) => {
    const drafts = new Map<number, string>();
    let writes = 0;

    const listener = (envelope: AnyEnvelope) => {
        const data = envelope.data as { type?: string; chatId?: number; draft?: string } | null;
        if (data === null || typeof data !== 'object') return;

        if (data.type === 'save-draft' && data.chatId !== undefined) {
            drafts.set(data.chatId, data.draft ?? '');
            writes += 1;
            return;
        }
        if (data.type === 'load-draft' && data.chatId !== undefined) {
            response(context, envelope, { chatId: data.chatId, draft: drafts.get(data.chatId) ?? '', writes });
        }
    };

    context.addEventListener('message', listener);
    return () => context.removeEventListener('message', listener);
});

createDenseNetwork(useContextMessagePort(), storage).launch();
