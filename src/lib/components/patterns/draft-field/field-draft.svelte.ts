import { PendingSave } from '$lib/utils/pendingSave.svelte';

/**
 * One field's draft against its saved value. The draft follows the saved value until the user edits it.
 * An edit made while a save is in flight is kept when that save lands, even one back to the value saved before it.
 */
export class FieldDraft<T> {
	#source: () => T;
	#edit = $state<{ value: T } | null>(null);
	#save = new PendingSave();
	saved = $derived.by(() => this.#source());
	error = $state<string | null>(null);

	constructor(saved: () => T) {
		this.#source = saved;
	}

	get value(): T {
		return this.#edit ? this.#edit.value : this.saved;
	}

	set value(next: T) {
		this.#edit = !this.#save.pending && Object.is(next, this.saved) ? null : { value: next };
	}

	get changed(): boolean {
		return this.#edit !== null && !Object.is(this.#edit.value, this.saved);
	}

	get saving(): boolean {
		return this.#save.pending;
	}

	async save(write: (value: T) => Promise<void>): Promise<void> {
		if (!this.changed) return;
		const submitted = this.value;
		await this.#save.run(async () => {
			this.error = null;
			try {
				await write(submitted);
				this.saved = submitted;
				if (this.#edit && Object.is(this.#edit.value, submitted)) this.#edit = null;
			} catch (error) {
				this.error = error instanceof Error ? error.message : 'Try again.';
			}
		});
	}

	undo() {
		this.#edit = null;
		this.error = null;
	}
}
