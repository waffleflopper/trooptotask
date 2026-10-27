import { toast as sonnerToast, type ExternalToast } from 'svelte-sonner';

export type ToastId = string | number;

export interface ToastAction {
	label: string;
	onClick: () => void;
}

class ToastStore {
	#options(duration: number, action?: ToastAction, description?: string): ExternalToast {
		return {
			duration,
			action,
			description
		};
	}

	success(message: string, duration?: number, action?: ToastAction, description?: string): ToastId {
		return sonnerToast.success(message, this.#options(duration ?? 4000, action, description));
	}

	error(message: string, duration?: number, action?: ToastAction, description?: string): ToastId {
		return sonnerToast.error(message, this.#options(duration ?? 6000, action, description));
	}

	warning(message: string, duration?: number, action?: ToastAction, description?: string): ToastId {
		return sonnerToast.warning(message, this.#options(duration ?? 4000, action, description));
	}

	info(message: string, duration?: number, action?: ToastAction, description?: string): ToastId {
		return sonnerToast.info(message, this.#options(duration ?? 4000, action, description));
	}

	dismiss(id?: ToastId): ToastId | undefined {
		return sonnerToast.dismiss(id);
	}
}

export const toastStore = new ToastStore();
