import { browser } from '$app/environment';
import { changelog } from '$lib/data/changelog';
import { whatsNewStore } from '$lib/stores/whatsNew.svelte';
import { getBrowserLocalStorage } from '$lib/utils/browserStorage';

export function autoShowWhatsNew(userId: string | null, hasShown: { value: boolean }) {
	if (browser && !hasShown.value && changelog.length > 0 && userId) {
		const storage = getBrowserLocalStorage();
		if (!storage) return;

		let lastSeen: string | null = null;
		try {
			lastSeen = storage.getItem(`changelog-last-seen-${userId}`);
		} catch {
			return;
		}

		if (lastSeen !== changelog[0].id) {
			hasShown.value = true;
			whatsNewStore.show();
		}
	}
}
