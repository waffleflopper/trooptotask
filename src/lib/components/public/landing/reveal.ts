import type { Attachment } from 'svelte/attachments';

export function motionAllowed(): boolean {
	return (
		typeof IntersectionObserver !== 'undefined' &&
		window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches === true
	);
}

/**
 * Server HTML is the final state. A block below the fold is armed as `data-reveal="pending"` and becomes `shown` once
 * it scrolls into view, so descendants style the hidden state with `in-data-[reveal=pending]:`. A block already on
 * screen stays as rendered rather than blinking out and back in.
 */
export const reveal: Attachment<HTMLElement> = (node) => {
	if (!motionAllowed() || node.getBoundingClientRect().top < window.innerHeight) return;
	node.dataset.reveal = 'pending';
	const observer = new IntersectionObserver(
		([entry]) => {
			if (!entry.isIntersecting) return;
			node.dataset.reveal = 'shown';
			observer.disconnect();
		},
		{ rootMargin: '0px 0px -15% 0px' }
	);
	observer.observe(node);
	return () => observer.disconnect();
};

export const ease = 'ease-[cubic-bezier(0.16,1,0.3,1)]';
export const fadeUp = `transition-[opacity,translate] duration-700 ${ease} in-data-[reveal=pending]:translate-y-6 in-data-[reveal=pending]:opacity-0`;
