// Runs in the owned browser, like the adjacent feedback control.
export function installBusyControl(target) {
	if (target.__mapBusy) throw new Error('Restore the previous busy observer first');
	const document = target.document;
	const entries = [];
	const last = new WeakMap();
	const record = () => {
		for (const button of document.querySelectorAll('button[type="submit"]')) {
			const text = button.textContent.replace(/\s+/g, ' ').trim();
			const key = `${text}|${button.disabled}|${button.getAttribute('aria-busy')}`;
			if (last.get(button) === key || entries.length >= 40) continue;
			last.set(button, key);
			entries.push({ text, disabled: button.disabled, ariaBusy: button.getAttribute('aria-busy') });
		}
	};
	record();
	const observer = new target.MutationObserver(record);
	observer.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
		attributeFilter: ['disabled', 'aria-busy']
	});
	target.__mapBusy = { observer, entries };
	return { armed: true, entries: [...entries] };
}
