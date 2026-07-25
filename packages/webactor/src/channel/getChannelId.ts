import { AnyEnvelope } from '../envelope';
import { getFirstRouteCheckpoint } from '../utils/route';

export function getChannelId(envelope: AnyEnvelope): string | undefined {
    return envelope.__checkpoints == null ? undefined : getFirstRouteCheckpoint(envelope.__checkpoints);
}
