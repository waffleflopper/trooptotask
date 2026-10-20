import { tick } from 'svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import { toastStore, type ToastId } from '$lib/stores/toast.svelte';
import { settleAction, type SettleOptions } from '$lib/utils/settleAction';

type SubmitCallback = Exclude<Awaited<ReturnType<SubmitFunction>>, void>;
type SlugAction = 'update' | 'clear';

/** A name save: `from` is what Undo writes back, and an undo save offers no further Undo. */
export interface NameChange {
	from: string | null;
	to: string;
	undo: boolean;
}

/** One General settings lifetime, recreated by the canonical Organization key. */
export class GeneralSettingsWorkspace {
	#active = true;
	#undoToast: ToastId | null = null;
	#undoForm: () => HTMLFormElement | null;
	nameLoading = $state(false);
	slugLoading = $state(false);
	nameRequestError = $state<string | null>(null);
	slugRequestError = $state<string | null>(null);
	nameEditing = $state(false);
	undoName = $state('');
	slugConfirmOpen = $state(false);
	slugConfirmed = $state(false);
	pendingSlugAction = $state<SlugAction | null>(null);
	slugFormAction = $state('?/updateSlug');

	#isCurrent = () => this.#active;

	constructor(undoForm: () => HTMLFormElement | null) {
		this.#undoForm = undoForm;
	}

	dispose(): void {
		this.#active = false;
		this.#dismissUndo();
	}

	startNameEdit(): void {
		this.nameEditing = true;
	}
	cancelNameEdit(): void {
		this.nameEditing = false;
		this.nameRequestError = null;
	}

	requestSlugClear(): void {
		if (this.slugLoading) return;
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

	submitName(cancel: () => void, focus: SettleOptions['focus'], change: NameChange): SubmitCallback | void {
		if (!this.#active || this.nameLoading) {
			cancel();
			return;
		}
		if (!change.undo && change.to.trim() === (change.from ?? '')) {
			cancel();
			this.cancelNameEdit();
			return;
		}
		this.#dismissUndo();
		this.nameLoading = true;
		this.nameRequestError = null;
		return async (outcome) => {
			await settleAction(outcome, {
				isCurrent: this.#isCurrent,
				settled: (error) => {
					this.nameRequestError = error;
					this.nameLoading = false;
				},
				focus
			});
			if (this.#active && outcome.result.type === 'success') this.#announceRename(change);
		};
	}

	#announceRename({ from, to, undo }: NameChange): void {
		const name = to.trim();
		if (undo || !from) {
			toastStore.success(undo ? `Unit name changed back to ${name}.` : `Unit name changed to ${name}.`);
			return;
		}
		this.#undoToast = toastStore.success(`Unit name changed to ${name}.`, 10_000, {
			label: 'Undo',
			onClick: () => void this.#undo(from)
		});
	}

	async #undo(previous: string): Promise<void> {
		this.#undoToast = null;
		if (!this.#active) return;
		this.undoName = previous;
		await tick();
		if (this.#active) this.#undoForm()?.requestSubmit();
	}

	#dismissUndo(): void {
		if (this.#undoToast !== null) toastStore.dismiss(this.#undoToast);
		this.#undoToast = null;
	}

	submitSlug(cancel: () => void, focus: (action: SlugAction) => SettleOptions['focus']): SubmitCallback | void {
		if (!this.#active || this.slugLoading) {
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
			await settleAction(outcome, {
				isCurrent: this.#isCurrent,
				settled: (error) => {
					this.slugRequestError = error;
					this.slugLoading = false;
					this.slugFormAction = '?/updateSlug';
				},
				focus: focus(action)
			});
			// A saved web address answers with a redirect to the General page at its new path.
			const { result } = outcome;
			if (this.#active && result.type === 'redirect' && result.location.endsWith('/settings/general'))
				toastStore.success(
					action === 'clear'
						? 'Web address reset. The unit uses its default address again.'
						: 'Web address updated. Bookmarks and shared links to the old address need updating.'
				);
		};
	}
}
