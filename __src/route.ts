const PATH_SEPARATOR = '/';

export function extendRoute(route: string, part: string) {
    return route + PATH_SEPARATOR + part;
}

export function reduceRoute(route: string, part: string) {
    return route.slice(0, route.length - part.length - PATH_SEPARATOR.length);
}

export function getFirstRoutePart(route: string) {
    return route.substring(0, route.indexOf(PATH_SEPARATOR));
}

export function routeEndsWith(route: string, part: string) {
    return route.endsWith(PATH_SEPARATOR + part);
}
