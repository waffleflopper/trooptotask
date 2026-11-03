import { page } from '$app/state';

/**
 * Steps back `entries` of the page's own history. Help's shallow entries sit above whatever the page pushed, so a page
 * stepping back past them closes Help and reaches its own previous entry instead of only moving Help.
 */
export function historyBack(entries = 1) {
	const steps = entries + (page.state.help?.depth ?? 0);
	if (steps === 1) history.back();
	else history.go(-steps);
}
