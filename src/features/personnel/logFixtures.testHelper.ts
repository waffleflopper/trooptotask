import type { PersonnelFollowUp, PersonnelLeaderNote } from './contracts';

export function makeFollowUp(overrides: Partial<PersonnelFollowUp> = {}): PersonnelFollowUp {
	return {
		id: 'follow-up-1',
		personnelId: 'person-1',
		title: 'Dental readiness',
		notes: 'Needs appointment',
		dueDate: null,
		status: 'open',
		createdBy: '1SG Ramos',
		createdAt: '2026-10-01T12:00:00.000Z',
		updatedAt: '2026-10-01T12:00:00.000Z',
		completedAt: null,
		completedBy: null,
		archivedAt: null,
		archivedBy: null,
		...overrides
	};
}

export function makeLeaderNote(overrides: Partial<PersonnelLeaderNote> = {}): PersonnelLeaderNote {
	return {
		id: 'note-1',
		personnelId: 'person-1',
		author: '1SG Ramos',
		text: 'Strong week at the range.',
		createdAt: '2026-10-01T12:00:00.000Z',
		archivedAt: null,
		archivedBy: null,
		...overrides
	};
}

export interface RecordedRequest {
	url: string;
	method: string;
	body: unknown;
}

export function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fetch whose responses come from `respond`, with every request kept for the test to read. */
export function recordingFetch(respond: (request: RecordedRequest) => Response | Promise<Response>) {
	const requests: RecordedRequest[] = [];
	const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const request: RecordedRequest = {
			url: String(input),
			method: init?.method ?? 'GET',
			body: typeof init?.body === 'string' ? JSON.parse(init.body) : null
		};
		requests.push(request);
		return respond(request);
	}) as typeof fetch;
	return { fetch: fetchFn, requests };
}
