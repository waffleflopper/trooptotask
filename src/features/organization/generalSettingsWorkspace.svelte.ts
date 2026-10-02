import { tick } from 'svelte';
import type { SubmitFunction } from '@sveltejs/kit';

type SubmitCallback = Exclude<Awaited<ReturnType<SubmitFunction>>, void>;

/** One General settings lifetime, recreated by the canonical Organization key. */
export class GeneralSettingsWorkspace {
	#active = true;
	nameLoading = $state(false);
	slugLoading = $state(false);
	nameEditing = $state(false);
	nameConfirmOpen = $state(false);
	nameConfirmed = $state(false);
	slugConfirmOpen = $state(false);
	slugConfirmed = $state(false);
	pendingSlugAction = $state<'update' | 'clear' | null>(null);
	slugFormAction = $state('?/updateSlug');

	dispose(): void {
		this.#active = false;
	}

	startNameEdit(): void {
		this.nameEditing = true;
	}
	cancelNameEdit(): void {
		this.nameEditing = false;
	}
	requestNameSave(): void {
		this.nameConfirmOpen = true;
	}
	cancelNameSave(): void {
		this.nameConfirmOpen = false;
	}

	confirmNameSave(form: HTMLFormElement | null): void {
		if (!this.#active) return;
		this.nameConfirmed = true;
		this.nameConfirmOpen = false;
		form?.requestSubmit();
	}

	requestSlugClear(): void {
		this.pendingSlugAction = 'clear';
		this.slugConfirmOpen = true;
	}

	async confirmSlugAction(form: HTMLFormElement | null): Promise<void> {
		if (!this.#active) return;
		this.slugConfirmed = true;
		this.slugConfirmOpen = false;
		if (this.pendingSlugAction === 'clear') {
			this.slugFormAction = '?/clearSlug';
			await tick();
		}
		if (this.#active) form?.requestSubmit();
	}

	cancelSlugAction(): void {
		this.slugConfirmOpen = false;
		this.pendingSlugAction = null;
	}

	submitName(cancel: () => void): SubmitCallback | void {
		if (!this.#active) {
			cancel();
			return;
		}
		if (!this.nameConfirmed) {
			cancel();
			this.requestNameSave();
			return;
		}
		this.nameConfirmed = false;
		this.nameLoading = true;
		return async ({ update }) => {
			if (!this.#active) return;
			this.nameLoading = false;
			await update();
		};
	}

	submitSlug(cancel: () => void): SubmitCallback | void {
		if (!this.#active) {
			cancel();
			return;
		}
		if (!this.slugConfirmed) {
			cancel();
			this.pendingSlugAction = 'update';
			this.slugConfirmOpen = true;
			return;
		}
		this.slugConfirmed = false;
		this.pendingSlugAction = null;
		this.slugLoading = true;
		return async ({ update }) => {
			if (!this.#active) return;
			this.slugLoading = false;
			this.slugFormAction = '?/updateSlug';
			await update();
		};
	}
}
