import { filter, map, Observable, of, retry, switchMap, tap } from 'rxjs';
import { createEnvelope } from '../envelope';
import { dispatch } from '../pubsub/dispatch';
import { Envelope, MessagePortLike } from '../types';
import { throwing } from '../utils';
import { isDedicatedWorkerScope, isSharedWorkerScope, isWindowScope } from '../utils/detect';
import { ensureMessagePortLike } from '../utils/ensure';
import { fromMessagePortLike } from '../utils/rx';

const REQ_SUPERVISOR_PORT = 'REQ_SUPERVISOR_PORT';
const RES_SUPERVISOR_PORT = 'RES_SUPERVISOR_PORT';
type ReqEnvelope = Envelope<typeof REQ_SUPERVISOR_PORT, MessagePortLike, [MessagePortLike]>;

fromMessagePortLike(globalThis)
    .pipe(
        filter((envelope): envelope is ReqEnvelope => envelope.type === REQ_SUPERVISOR_PORT),
        switchMap((envelope) => supervisor$.pipe(
            map((supervisor) => dispatch(
                envelope.payload,
                createEnvelope(RES_SUPERVISOR_PORT, supervisor, [supervisor])
            )),
        )),
        tap({ error: (err) => console.error(`Error in supervisor request: ${err.message}`) }),
        retry()
    )
    .subscribe()

const parentSupervisor$ = () => {
    const supervisorPortChannel = new MessageChannel();
    return dispatch(
        globalThis.parent as MessagePortLike,
        createEnvelope(REQ_SUPERVISOR_PORT, supervisorPortChannel.port1, [supervisorPortChannel.port1])
    ).pipe(
        switchMap((): Observable<MessagePortLike> => {
            return fromMessagePortLike(supervisorPortChannel.port2).pipe(
                map((envelope) => ensureMessagePortLike(envelope.payload) ?? envelope.payload),
            )
        })
    );
}

export const supervisor$: Observable<MessagePortLike> = isWindowScope(globalThis)
    ? of(new SharedWorker(new URL('./supervisor.js', import.meta.url)).port)
    : isDedicatedWorkerScope(globalThis) || isSharedWorkerScope(globalThis)
        ? parentSupervisor$()
        : throwing(`Unsupported global scope: ${globalThis.constructor.name}. Expected Window, DedicatedWorkerGlobalScope, or SharedWorkerGlobalScope.`);
