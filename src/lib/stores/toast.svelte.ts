import { toast as sonnerToast, type ExternalToast } from 'svelte-sonner';

/**
 * Sonner-backed global notifications for transient user feedback.
 *
 * Auto-dismisses after `duration` ms (default 4000ms; errors default to 6000ms).
 * Rendered by the shadcn-svelte `Toaster` mounted in the root layout.
 *
 * Usage: `toastStore.success('Saved')`, `toastStore.error('Something went wrong')`.
 * Dismiss manually with `toastStore.dismiss(id)` if needed (e.g., for loading toasts).
 * Pass an `action` as the third argument to render an inline action button on the toast.
 */
export type ToastId = string | number;

export interface ToastAction {
	label: string;
	onClick: () => void;
}

class ToastStore {
	#options(duration: number, action?: ToastAction): ExternalToast {
		return {
			duration,
			action
		};
	}

	success(message: string, duration?: number, action?: ToastAction): ToastId {
		return sonnerToast.success(message, this.#options(duration ?? 4000, action));
	}

	error(message: string, duration?: number, action?: ToastAction): ToastId {
		return sonnerToast.error(message, this.#options(duration ?? 6000, action));
	}

	warning(message: string, duration?: number, action?: ToastAction): ToastId {
		return sonnerToast.warning(message, this.#options(duration ?? 4000, action));
	}

	info(message: string, duration?: number, action?: ToastAction): ToastId {
		return sonnerToast.info(message, this.#options(duration ?? 4000, action));
	}

	dismiss(id?: ToastId): ToastId | undefined {
		return sonnerToast.dismiss(id);
	}
}

export const toastStore = new ToastStore();
