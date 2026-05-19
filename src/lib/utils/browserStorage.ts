import { browser } from '$app/environment';

export function getBrowserLocalStorage(): Storage | null {
	if (typeof process !== 'undefined' && process.versions?.node) return null;
	if (!browser || typeof globalThis.document === 'undefined') return null;

	try {
		return globalThis.document.defaultView?.localStorage ?? null;
	} catch {
		return null;
	}
}
