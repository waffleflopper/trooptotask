export type StreamedState<T> =
	| { state: 'pending' }
	| { state: 'ready'; value: T }
	| { state: 'failed' }
	| { state: 'absent' };

/**
 * Follows a streamed load value. A refresh keeps the last settled result until the new promise
 * settles, so an invalidation does not drop a section back to its skeleton or unmount what it holds.
 * A null source is a value the server chose not to load, such as a feature the unit turned off.
 */
export class StreamedValue<T> {
	current = $state<StreamedState<T>>({ state: 'pending' });

	constructor(source: () => Promise<T> | null) {
		// Effects do not run during server rendering, so an absent source is known before the first paint.
		if (source() === null) this.current = { state: 'absent' };
		$effect.pre(() => {
			const promise = source();
			if (!promise) {
				this.current = { state: 'absent' };
				return;
			}
			let live = true;
			promise.then(
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
