// Runs in the owned browser, like the adjacent network control.
export function installFeedbackControl(target) {
	if (target.__mapFeedback) throw new Error('Restore the previous feedback observer first');
	const document = target.document;
	const observed = new WeakMap();
	const signature = (toast) => toast.getAttribute('data-type') + ':' + toast.innerText.trim();
	for (const toast of document.querySelectorAll('[data-sonner-toast]')) observed.set(toast, signature(toast));
	const entries = [];
	const seen = new Set();
	const observer = new target.MutationObserver(() => {
		for (const toast of document.querySelectorAll('[data-sonner-toast]')) {
			const key = signature(toast);
			const previous = observed.get(toast);
			observed.set(toast, key);
			const text = toast.innerText.trim();
			const type = toast.getAttribute('data-type');
			if (previous === key || !text || !['success', 'error'].includes(type) || entries.length >= 20) continue;
			if (seen.has(key)) continue;
			seen.add(key);
			entries.push({ type, text });
		}
	});
	observer.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
		attributeFilter: ['data-type']
	});
	target.__mapFeedback = { observer, entries };
	return { armed: true };
}
