const STORAGE_PREFIX = 'trooptotask_';

export function loadFromStorage<T>(key: string, defaultValue: T): T {
	if (typeof window === 'undefined') {
		return defaultValue;
	}

	try {
		const stored = localStorage.getItem(STORAGE_PREFIX + key);
		if (stored) {
			return JSON.parse(stored) as T;
		}
	} catch (e) {
		console.error(`Error loading ${key} from localStorage:`, e);
	}

	return defaultValue;
}

export function saveToStorage<T>(key: string, value: T): void {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
	} catch (e) {
		console.error(`Error saving ${key} to localStorage:`, e);
	}
}

export function removeFromStorage(key: string): void {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		localStorage.removeItem(STORAGE_PREFIX + key);
	} catch (e) {
		console.error(`Error removing ${key} from localStorage:`, e);
	}
}

export function generateId(): string {
	return crypto.randomUUID();
}
