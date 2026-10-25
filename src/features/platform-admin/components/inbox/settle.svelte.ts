export interface SettledRead<T> {
	/** Identifies the load that produced it, so a newer load can tell its own result from an older one. */
	source: object;
	/** What the result belongs to, such as a tab. A different group never shows another group's result. */
	group: string;
	value: T;
}

/**
 * Holds the last result of a streamed read while the next one loads, so a refresh keeps the rows on screen
 * instead of flashing a skeleton. A result that arrives after a newer read began is dropped.
 */
export function settleRead<T>(read: () => { source: object; group: string; promise: Promise<T> }) {
	let settled = $state.raw<SettledRead<T> | null>(null);
	$effect(() => {
		const { source, group, promise } = read();
		let current = true;
		void promise.then((value) => {
			if (current) settled = { source, group, value };
		});
		return () => {
			current = false;
		};
	});
	return {
		get settled() {
			return settled;
		}
	};
}
