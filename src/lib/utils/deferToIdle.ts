export function deferToIdle(callback: () => void, options?: { timeout?: number }): () => void {
	if (typeof window === 'undefined') return () => {};

	if (typeof requestIdleCallback === 'function') {
		const id = requestIdleCallback(callback, options);
		return () => cancelIdleCallback(id);
	}

	const id = setTimeout(callback, 0);
	return () => clearTimeout(id);
}
