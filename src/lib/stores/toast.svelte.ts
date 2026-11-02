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
			const id = sonnerToast.error(
				message,
				this.#options(
					Math.max(duration ?? 6000, REPORTABLE_ERROR_TOAST_MS),
					{
						label: 'Report error',
						onClick: () => handler.open(reference)
					},
					description
				)
			);
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

	dismiss(id?: ToastId): ToastId | undefined {
		return sonnerToast.dismiss(id);
	}
}

export const toastStore = new ToastStore();
