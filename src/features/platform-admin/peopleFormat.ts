import type { PersonState } from '$features/identity/contracts';
import type { BadgeVariant } from '$lib/components/ui/badge';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** When something happened, as a person would say it: "12 min ago", "3 days ago", "20 Oct". */
export function formatAgo(iso: string, now: Date): string {
	const at = new Date(iso);
	const elapsed = Math.max(0, now.getTime() - at.getTime());
	if (elapsed < MINUTE) return 'Just now';
	if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
	if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hr ago`;
	if (elapsed < 7 * DAY) {
		const days = Math.floor(elapsed / DAY);
		return `${days} ${days === 1 ? 'day' : 'days'} ago`;
	}
	return at.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
	});
}

export function formatSignIn(iso: string | null, now: Date): string {
	return iso ? formatAgo(iso, now) : 'Never';
}

export function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const PERSON_STATE_VIEW: Record<PersonState['kind'], { label: string; variant: BadgeVariant }> = {
	active: { label: 'Active', variant: 'success' },
	notSetUp: { label: 'Not set up', variant: 'warning' },
	suspended: { label: 'Suspended', variant: 'danger' }
};

/** Where a person's page lives: an account page, or the request page for someone who has no account yet. */
export function personHref(state: PersonState): string {
	return state.kind === 'notSetUp' ? `/admin/people/not-set-up/${state.requestId}` : `/admin/people/${state.userId}`;
}

export function organizationsLabel(count: number, state: PersonState): string {
	if (state.kind === 'notSetUp') return 'None yet';
	if (count === 0) return 'None';
	return `${count} ${count === 1 ? 'Organization' : 'Organizations'}`;
}
