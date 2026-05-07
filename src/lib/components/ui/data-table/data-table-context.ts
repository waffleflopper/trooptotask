const interactiveDescendantSelector = [
	'a[href]',
	'button',
	'input:not([type="hidden"])',
	'select',
	'textarea',
	'summary',
	'[contenteditable=""]',
	'[contenteditable="true"]',
	'[role="button"]',
	'[role="checkbox"]',
	'[role="combobox"]',
	'[role="link"]',
	'[role="menuitem"]',
	'[role="option"]',
	'[role="radio"]',
	'[role="switch"]',
	'[role="textbox"]',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

export function eventStartedInInteractiveDescendant(event: Event): boolean {
	const currentTarget = event.currentTarget;
	if (!(currentTarget instanceof HTMLElement)) return false;

	for (const target of event.composedPath()) {
		if (target === currentTarget) return false;
		if (target instanceof HTMLElement && target.matches(interactiveDescendantSelector)) return true;
	}

	return false;
}
