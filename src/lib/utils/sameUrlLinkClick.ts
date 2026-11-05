import { goto } from '$app/navigation';
import { updated } from '$app/state';

// Kit 3 reruns every load when a link to the current URL is clicked, which unmounts streamed workspaces and
// their local state. This navigates without the refresh, so navigation hooks, scroll and focus reset still run.
// Runs on body so link handlers still fire and Kit's documentElement listener skips the click. Once a new version is
// live the click goes to Kit as a link, so UpdateAvailableNotice loads it as a full page after the guards pass.
export function navigateWithoutRefreshOnSameUrlClick(event: MouseEvent) {
	if (updated.current || event.defaultPrevented || event.button) return;
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	const link = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
	if (!link || link.href !== location.href || link.hash || link.hasAttribute('download')) return;
	if ((link.target && link.target !== '_self') || link.closest('[data-sveltekit-reload]')) return;
	event.preventDefault();
	const reset = link.closest('[data-sveltekit-reset]')?.getAttribute('data-sveltekit-reset') !== 'false';
	void goto(link.href, { replace: true, reset });
}
