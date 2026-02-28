type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
	id: string;
	type: ToastType;
	message: string;
	duration: number;
}

class ToastStore {
	list = $state<Toast[]>([]);

	#add(type: ToastType, message: string, duration = 4000) {
		const id = crypto.randomUUID();
		this.list.push({ id, type, message, duration });

		setTimeout(() => {
			this.dismiss(id);
		}, duration);
	}

	success(message: string, duration?: number) {
		this.#add('success', message, duration);
	}

	error(message: string, duration?: number) {
		this.#add('error', message, duration ?? 6000);
	}

	warning(message: string, duration?: number) {
		this.#add('warning', message, duration);
	}

	info(message: string, duration?: number) {
		this.#add('info', message, duration);
	}

	dismiss(id: string) {
		this.list = this.list.filter((t) => t.id !== id);
	}
}

export const toastStore = new ToastStore();
