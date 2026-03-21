export type BeforeAddHook<T> = (items: T[], data: Omit<T, 'id'>) => { items: T[]; displaced?: T };
