/** One save at a time; a submit while one is pending is ignored. */
export class PendingSave {
	pending = $state(false);

	async run(save: () => Promise<void>) {
		if (this.pending) return;
		this.pending = true;
		try {
			await save();
		} finally {
			this.pending = false;
		}
	}
}
