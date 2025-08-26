export type Route = string;
export type Checkpoint = string;

const PATH_SEPARATOR = '/';

export function createRoute(...checkpoints: Checkpoint[]): Route {
    return checkpoints.join(PATH_SEPARATOR);
}

export function extendRoute(route: Route, checkpoint: Checkpoint) {
    return route + PATH_SEPARATOR + checkpoint;
}

export function reduceRoute(route: Route, checkpoint: Checkpoint) {
    return route.slice(0, route.length - checkpoint.length - PATH_SEPARATOR.length);
}

export function getFirstRouteCheckpoint(route: Route) {
    return route.substring(0, route.indexOf(PATH_SEPARATOR));
}

export function routeEndsWith(route: Route, checkpoint: Checkpoint) {
    return route.endsWith(PATH_SEPARATOR + checkpoint);
}
