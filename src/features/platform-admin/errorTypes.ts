import type { ErrorGroup, ErrorGroupPage, ErrorGroupStatus, ErrorKind } from '$features/error-reporting/contracts';

export const ERROR_STATUS_FILTERS: ReadonlyArray<{ value: ErrorGroupStatus; label: string }> = [
	{ value: 'open', label: 'Open' },
	{ value: 'resolved', label: 'Resolved' }
];

export function parseErrorStatus(value: string | null): ErrorGroupStatus {
	return value === 'resolved' ? 'resolved' : 'open';
}

export function parseErrorPage(value: string | null): number {
	const page = Number(value ?? 1);
	return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 2_147_483_647) : 1;
}

/** One read settles to its page or to a message, so a failed read shows its own error instead of breaking the page. */
export type ErrorGroupRegion = { status: 'ok'; data: ErrorGroupPage } | { status: 'error'; message: string };

export type ResolveErrorGroupOutcome = { status: 'resolved' } | { status: 'not_open' };

export const ERROR_KIND_LABELS: Record<ErrorKind, string> = {
	server_response: 'Server error',
	server_exception: 'Server exception',
	render: 'Page error',
	transport: 'Network failure',
	unconfirmed_write: 'Unconfirmed save'
};

export function describeErrorLocation(group: Pick<ErrorGroup, 'method' | 'routeId'>): string {
	return [group.method, group.routeId].filter(Boolean).join(' ') || 'No route';
}
