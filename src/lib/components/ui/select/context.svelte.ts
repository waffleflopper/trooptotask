import { getContext, setContext } from 'svelte';

class SelectState {
	trigger = $state<HTMLElement | null>(null);
}

const SELECT_CONTEXT = Symbol('select');

export function createSelectContext() {
	return setContext(SELECT_CONTEXT, new SelectState());
}

export function getSelectContext() {
	return getContext<SelectState | undefined>(SELECT_CONTEXT);
}

/**
 * The listbox takes whatever names its trigger, in accessible-name order. The trigger's own
 * text is its selected value, so it never names the listbox.
 */
export function listboxName(trigger: HTMLElement | null) {
	if (!trigger) return {};
	const labelledBy = trigger
		.getAttribute('aria-labelledby')
		?.split(/\s+/)
		.filter((id) => id && id !== trigger.id)
		.join(' ');
	if (labelledBy) return { 'aria-labelledby': labelledBy };
	const label = trigger.getAttribute('aria-label');
	if (label) return { 'aria-label': label };
	const labelIds = Array.from((trigger as HTMLButtonElement).labels ?? [], (element) => element.id).filter(Boolean);
	return labelIds.length > 0 ? { 'aria-labelledby': labelIds.join(' ') } : {};
}
