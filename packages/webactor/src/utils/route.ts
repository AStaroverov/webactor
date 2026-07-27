import { AnyEnvelope } from '../envelope';

export type Route = string;
export type Checkpoint = string;

const PATH_SEPARATOR = '/';

export function createRoute(...checkpoints: Checkpoint[]): Route {
    return checkpoints.join(PATH_SEPARATOR);
}

export function extendRoute(route: Route, ...checkpoints: [Checkpoint, Checkpoint]) {
    return route + PATH_SEPARATOR + checkpoints.join(PATH_SEPARATOR);
}

export function reduceRoute(route: Route, ...checkpoints: [Checkpoint, Checkpoint]) {
    return route.slice(0, route.length - checkpoints.join(PATH_SEPARATOR).length - PATH_SEPARATOR.length);
}

export function getFirstRouteCheckpoint(route: Route) {
    const index = route.indexOf(PATH_SEPARATOR);
    return index === -1 ? route : route.substring(0, index);
}

export function getLastRouteCheckpoint(route: Route) {
    return route.substring(route.lastIndexOf(PATH_SEPARATOR) + 1);
}

export function routeEndsWith(route: Route, ...checkpoints: [Checkpoint, Checkpoint]) {
    return route.endsWith(PATH_SEPARATOR + checkpoints.join(PATH_SEPARATOR));
}

export function isRoutedEnvelope(envelope: AnyEnvelope): envelope is AnyEnvelope & { __route: Route } {
    return envelope.__route !== undefined;
}
