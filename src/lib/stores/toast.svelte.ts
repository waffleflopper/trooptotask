/**
 * Toast store — global notification queue for transient user feedback.
 *
 * Auto-dismisses after `duration` ms (default 4000ms; errors default to 6000ms).
 * Rendered by `ToastContainer.svelte` mounted in the root layout.
 *
 * Usage: `toastStore.success('Saved')`, `toastStore.error('Something went wrong')`.
 * Dismiss manually with `toastStore.dismiss(id)` if needed (e.g., for loading toasts).
 * Pass an `action` as the third argument to render an inline action button on the toast.
 */
type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
	label: string;
	onClick: () => void;
}

interface Toast {
	id: string;
	type: ToastType;
	message: string;
	duration: number;
	action?: ToastAction;
}

class ToastStore {
	list = $state<Toast[]>([]);

	#add(type: ToastType, message: string, duration: number, action?: ToastAction) {
		const id = crypto.randomUUID();
		this.list.push({ id, type, message, duration, action });

		setTimeout(() => {
			this.dismiss(id);
		}, duration);
	}

	success(message: string, duration?: number, action?: ToastAction) {
		this.#add('success', message, duration ?? 4000, action);
	}

	error(message: string, duration?: number, action?: ToastAction) {
		this.#add('error', message, duration ?? 6000, action);
	}

	warning(message: string, duration?: number, action?: ToastAction) {
		this.#add('warning', message, duration ?? 4000, action);
	}

	info(message: string, duration?: number, action?: ToastAction) {
		this.#add('info', message, duration ?? 4000, action);
	}

	dismiss(id: string) {
		this.list = this.list.filter((t) => t.id !== id);
	}
}

export const toastStore = new ToastStore();
