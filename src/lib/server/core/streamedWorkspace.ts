export interface DeferredData<T> {
	data: Promise<T>;
}

export type HydrationItems<T = unknown> = T[] | Promise<T[]>;
