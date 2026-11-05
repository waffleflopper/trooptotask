import { toast as sonnerToast, type ExternalToast } from 'svelte-sonner';
import { takeFreshErrorReference, type PendingErrorReference } from './errorReportLedger';

export type ToastId = string | number;

export interface ToastAction {
	label: string;
	onClick: () => void;
}

/** Long enough to read the failure and reach the action without hurrying. */
export const REPORTABLE_ERROR_TOAST_MS = 15_000;

export interface ErrorReportHandler {
	/** The Organization URL segment this handler serves; a failure from another one is not offered. */
	org: string | null;
	open(reference: PendingErrorReference): void;
}

let errorReportHandler: ErrorReportHandler | null = null;
/** Toasts whose action needs the current handler; they go with it, so no button is left that can open nothing. */
const reportToasts = new Set<ToastId>();

/** Let failure toasts offer "Report error" while a surface that can take the report is mounted. Returns its unregister. */
export function registerErrorReportHandler(handler: ErrorReportHandler): () => void {
	errorReportHandler = handler;
	return () => {
		if (errorReportHandler !== handler) return;
		errorReportHandler = null;
		for (const id of reportToasts) sonnerToast.dismiss(id);
		reportToasts.clear();
	};
}

export interface PersistentToast {
	/** A fixed id, so announcing the same thing again updates this toast instead of stacking another. */
	id: ToastId;
	message: string;
	action: ToastAction;
	/** Label of the only way to dismiss it. */
	dismissLabel: string;
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
		const handler = errorReportHandler;
		const reference = !action && handler ? takeFreshErrorReference(handler.org) : null;
		if (handler && reference) {
			// Sonner reports a swipe, close or expiry here, but not the action's own click.
			const forget = () => void reportToasts.delete(id);
			const id = sonnerToast.error(message, {
				...this.#options(
					Math.max(duration ?? 6000, REPORTABLE_ERROR_TOAST_MS),
					{
						label: 'Report error',
						onClick: () => {
							forget();
							handler.open(reference);
						}
					},
					description
				),
				onDismiss: forget,
				onAutoClose: forget
			});
			reportToasts.add(id);
			return id;
		}
		return sonnerToast.error(message, this.#options(duration ?? 6000, action, description));
	}

	warning(message: string, duration?: number, action?: ToastAction, description?: string): ToastId {
		return sonnerToast.warning(message, this.#options(duration ?? 4000, action, description));
	}

	info(message: string, duration?: number, action?: ToastAction, description?: string): ToastId {
		return sonnerToast.info(message, this.#options(duration ?? 4000, action, description));
	}

	/**
	 * A toast that stays until the user answers it, for news that does not expire. It sits top center, because the
	 * bottom-right corner covers the footer of a side sheet, where Save lives.
	 */
	persistent({ id, message, action, dismissLabel }: PersistentToast): ToastId {
		return sonnerToast(message, {
			id,
			duration: Infinity,
			position: 'top-center',
			closeButton: false,
			action: {
				label: action.label,
				// Keep the toast, so a navigation the browser's leave prompt cancels still leaves the action to retry.
				onClick: (event) => {
					event.preventDefault();
					action.onClick();
				}
			},
			cancel: { label: dismissLabel, onClick: () => {} }
		});
	}

	dismiss(id?: ToastId): ToastId | undefined {
		return sonnerToast.dismiss(id);
	}
}

export const toastStore = new ToastStore();
