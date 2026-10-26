import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
import { PendingSave } from '$lib/utils/pendingSave.svelte';

/** One write at a time for a list; a result lands only while the list that asked for it is still on screen. */
export class ListWrites {
	error = $state('');
	readonly saving = new PendingSave();
	#alive = true;

	stop() {
		this.#alive = false;
	}

	run<R>(request: () => Promise<R>, apply: (result: R) => void, failure: string) {
		return this.saving.run(async () => {
			this.error = '';
			try {
				apply(await withinOrganizationLifetime(request(), () => this.#alive));
			} catch (error) {
				this.error = rejectedRequestMessage(error, failure);
			}
		});
	}
}
