import type { Attachment } from 'svelte/attachments';

// A busy dialog disables its own controls; keep focus in the dialog instead of letting it fall to the page.
export function busyDialog(busy: boolean): Attachment<HTMLElement> {
	return (node) => {
		if (!busy) return;
		node.setAttribute('aria-busy', 'true');
		if (!node.hasAttribute('tabindex')) node.tabIndex = -1;
		const active = document.activeElement;
		if (active === document.body || (node.contains(active) && active?.matches(':disabled'))) node.focus();
		return () => node.removeAttribute('aria-busy');
	};
}
