export function isPromiseLike<T>(value: T | Promise<T> | null | undefined): value is Promise<T> {
	return !!value && typeof (value as Promise<T>).then === 'function';
}

export function materializeWorkspaceData<
	TData extends Record<string, unknown>,
	TStreamedDataKey extends keyof TData & string,
	TWorkspaceData
>(data: TData, workspaceKey: TStreamedDataKey, bootstrap: { data: TWorkspaceData } | null | undefined): TData {
	if (!bootstrap) {
		return data;
	}

	const workspaceValue = data[workspaceKey];
	if (!workspaceValue || typeof workspaceValue !== 'object') {
		return data;
	}

	return {
		...data,
		[workspaceKey]: {
			...(workspaceValue as Record<string, unknown>),
			data: bootstrap.data
		}
	} as TData;
}

export function normalizeDeferredError(error: unknown, fallbackMessage: string): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(fallbackMessage);
}

interface ObserveDeferredOptions<T> {
	fallbackMessage: string;
	onResolve?: (value: T) => void;
	onReject?: (error: Error) => void;
	isCancelled?: () => boolean;
}

export function observeDeferred<T>(promise: Promise<T>, options: ObserveDeferredOptions<T>): Promise<void> {
	return promise
		.then((value) => {
			if (options.isCancelled?.()) {
				return;
			}

			options.onResolve?.(value);
		})
		.catch((error: unknown) => {
			if (options.isCancelled?.()) {
				return;
			}

			options.onReject?.(normalizeDeferredError(error, options.fallbackMessage));
		});
}

export function throwRenderError(error: unknown, fallbackMessage: string): never {
	throw normalizeDeferredError(error, fallbackMessage);
}
