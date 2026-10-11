import { tick } from 'svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import { toastStore } from '$lib/stores/toast.svelte';
import { settleAction, type SettleOptions } from '$lib/utils/settleAction';

type SubmitCallback = Exclude<Awaited<ReturnType<SubmitFunction>>, void>;
type SlugAction = 'update' | 'clear';

/** One General settings lifetime, recreated by the canonical Organization key. */
export class GeneralSettingsWorkspace {
	#active = true;
	nameLoading = $state(false);
	slugLoading = $state(false);
	nameRequestError = $state<string | null>(null);
	slugRequestError = $state<string | null>(null);
	nameEditing = $state(false);
	nameConfirmOpen = $state(false);
	nameConfirmed = $state(false);
	slugConfirmOpen = $state(false);
	slugConfirmed = $state(false);
	pendingSlugAction = $state<SlugAction | null>(null);
	slugFormAction = $state('?/updateSlug');

	dispose(): void {
		this.#active = false;
	}

	startNameEdit(): void {
		this.nameEditing = true;
	}
	cancelNameEdit(): void {
		this.nameEditing = false;
		this.nameRequestError = null;
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

	submitName(cancel: () => void, focus: SettleOptions['focus']): SubmitCallback | void {
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
		this.nameRequestError = null;
		return async (outcome) => {
			if (!this.#active) return;
			this.nameRequestError = await settleAction(outcome, {
				focus,
				settled: () => (this.nameLoading = false)
			});
		};
	}

	submitSlug(cancel: () => void, focus: (action: SlugAction) => SettleOptions['focus']): SubmitCallback | void {
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
		const action = this.pendingSlugAction ?? 'update';
		this.slugConfirmed = false;
		this.pendingSlugAction = null;
		this.slugLoading = true;
		this.slugRequestError = null;
		return async (outcome) => {
			if (!this.#active) return;
			this.slugRequestError = await settleAction(outcome, {
				focus: focus(action),
				settled: () => {
					this.slugLoading = false;
					this.slugFormAction = '?/updateSlug';
				}
			});
			// A saved custom URL answers with a redirect to the General page at its new path.
			const { result } = outcome;
			if (result.type === 'redirect' && result.location.endsWith('/settings/general'))
				toastStore.success(
					action === 'clear'
						? 'Custom URL removed. The app path uses the Organization ID again.'
						: 'Custom URL updated. Bookmarks and shared links using the old URL will need updating.'
				);
		};
	}
}
