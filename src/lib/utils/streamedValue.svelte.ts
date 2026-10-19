export type StreamedState<T> = { state: 'pending' } | { state: 'ready'; value: T } | { state: 'failed' };

/**
 * Follows a streamed load value. A refresh keeps the last settled result until the new promise
 * settles, so an invalidation does not drop a section back to its skeleton or unmount what it holds.
 */
export class StreamedValue<T> {
	current = $state<StreamedState<T>>({ state: 'pending' });

	constructor(source: () => Promise<T>) {
		$effect.pre(() => {
			let live = true;
			source().then(
				(value) => {
					if (live) this.current = { state: 'ready', value };
				},
				() => {
					if (live) this.current = { state: 'failed' };
				}
			);
			return () => {
				live = false;
			};
		});
	}
}
