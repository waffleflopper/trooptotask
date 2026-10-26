import { invalidate, replaceState } from '$app/navigation';
import { page } from '$app/state';

let writes = 0;

export function setEventPageState(state: App.PageState) {
	writes++;
	replaceState('', state);
}

// invalidate() clears shallow page state, such as an open date review, so a reload puts it back
// unless the reader changed it or left the page while the reload ran.
export async function reloadCalendarEvents() {
	const { href } = page.url;
	const state = { ...page.state };
	const before = writes;
	await invalidate('app:calendar-events');
	if (writes === before && page.url.href === href) replaceState('', state);
}
