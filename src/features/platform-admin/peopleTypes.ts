export type PersonRegion<T> = { status: 'ok'; data: T } | { status: 'error'; message: string };
