import type { Attachment } from 'svelte/attachments';

// Chromium keeps focus on a control that becomes disabled until its next rendering update, then drops it to
// `body` without a focusin, so the Bits focus trap never sees it leave. Catch the disable and focus the dialog.
export const keepFocusInside: Attachment<HTMLElement> = (node) => {
	const observer = new MutationObserver(() => {
		if (node.dataset.state === 'closed') return;
		const active = document.activeElement;
		if (!active || active === document.body || (node.contains(active) && active.matches(':disabled'))) node.focus();
	});
	observer.observe(node, { attributes: true, attributeFilter: ['disabled'], subtree: true });
	return () => observer.disconnect();
};
