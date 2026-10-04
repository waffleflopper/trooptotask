import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountPreferencesState } from './accountPreferences.svelte';
import type { UserOrgPreferences, UserOrgPreferencesPatch } from './accountPreferences';

const { invalidate, invalidateAll } = vi.hoisted(() => ({ invalidate: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$app/navigation', () => ({ invalidate, invalidateAll }));

function preferences(): UserOrgPreferences {
	return {
		calendar: { showStatusText: false, showPersonnelRoles: false, highlightOnboarding: true },
		training: { selectedGroupId: null, selectedViewId: null, matrixViewMode: 'by-group' }
	};
}

interface PendingSave {
	url: string;
	patch: UserOrgPreferencesPatch;
	confirm: (otherSavedFields?: UserOrgPreferencesPatch) => void;
	respond: (body: unknown, status?: number) => void;
	reject: (error: unknown) => void;
	resolve: (response: Response) => void;
}

/** In-memory server port with held replies; expectations below are independent worked outcomes. */
function transport() {
	const saved = preferences();
	const requests: PendingSave[] = [];
	const fetcher: typeof fetch = vi.fn((_input, init) => {
		const patch = JSON.parse(String(init?.body)) as UserOrgPreferencesPatch;
		return new Promise<Response>((resolve, reject) => {
			requests.push({
				url: String(_input),
				patch,
				confirm(otherSavedFields = {}) {
					Object.assign(saved.calendar, otherSavedFields.calendar, patch.calendar);
					Object.assign(saved.training, otherSavedFields.training, patch.training);
					resolve(Response.json(saved));
				},
				respond: (body, status = 200) => resolve(Response.json(body, { status })),
				reject,
				resolve
			});
		});
	});
	return { saved, requests, fetcher };
}

const states: AccountPreferencesState[] = [];
function createState(
	server: ReturnType<typeof transport>,
	input = { userId: 'user-a', orgId: 'org-a', preferences: preferences() },
	onError = vi.fn<(message: string) => void>()
) {
	const state = new AccountPreferencesState(input, onError, server.fetcher);
	states.push(state);
	return { state, onError };
}

async function settleReplies() {
	await vi.advanceTimersByTimeAsync(0);
}

describe('AccountPreferencesState', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		for (const state of states.splice(0)) state.dispose();
		vi.useRealTimers();
	});

	it('owns its initial seed without timers or requests until an explicit edit', async () => {
		const server = transport();
		const seed = preferences();
		seed.training.selectedGroupId = 'seed-group';
		const { state } = createState(server, { userId: 'user-a', orgId: 'org-a', preferences: seed });
		expect(vi.getTimerCount()).toBe(0);
		seed.training.selectedGroupId = 'late-shell-group';
		seed.calendar.showPersonnelRoles = true;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(server.requests).toHaveLength(0);
		expect(state.value).toEqual({
			calendar: { showStatusText: false, showPersonnelRoles: false, highlightOnboarding: true },
			training: { selectedGroupId: 'seed-group', selectedViewId: null, matrixViewMode: 'by-group' }
		});
	});

	it('coalesces latest choices across sections after 350ms and saves without ambient invalidation', async () => {
		const server = transport();
		const { state, onError } = createState(server);
		state.patch({ training: { selectedGroupId: 'alpha' }, calendar: { highlightOnboarding: false } });
		await vi.advanceTimersByTimeAsync(200);
		state.patch({ training: { selectedGroupId: 'bravo', selectedViewId: 'focus' } });
		state.patch({ calendar: { highlightOnboarding: true, showStatusText: true } });
		expect(state.value).toEqual({
			calendar: { showStatusText: true, showPersonnelRoles: false, highlightOnboarding: true },
			training: { selectedGroupId: 'bravo', selectedViewId: 'focus', matrixViewMode: 'by-group' }
		});
		await vi.advanceTimersByTimeAsync(349);
		expect(server.requests).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(server.requests).toHaveLength(1);
		expect(server.requests[0]).toMatchObject({
			url: '/org/org-a/api/user-preferences',
			patch: {
				calendar: { highlightOnboarding: true, showStatusText: true },
				training: { selectedGroupId: 'bravo', selectedViewId: 'focus' }
			}
		});
		server.requests[0].confirm();
		await settleReplies();
		expect(server.saved).toEqual({
			calendar: { showStatusText: true, showPersonnelRoles: false, highlightOnboarding: true },
			training: { selectedGroupId: 'bravo', selectedViewId: 'focus', matrixViewMode: 'by-group' }
		});
		expect(onError).not.toHaveBeenCalled();
		expect(invalidate).not.toHaveBeenCalled();
		expect(invalidateAll).not.toHaveBeenCalled();
	});

	it('keeps newer same-field and disjoint choices over a held acknowledgment, then saves them serially', async () => {
		const server = transport();
		const { state } = createState(server);
		state.patch({ training: { selectedGroupId: 'alpha', selectedViewId: 'focus' } });
		await vi.advanceTimersByTimeAsync(350);
		state.patch({
			training: { selectedGroupId: 'bravo', matrixViewMode: 'alphabetical' },
			calendar: { showStatusText: true }
		});
		await vi.advanceTimersByTimeAsync(350);
		expect(server.requests).toHaveLength(1);
		expect(state.value).toEqual({
			calendar: { showStatusText: true, showPersonnelRoles: false, highlightOnboarding: true },
			training: { selectedGroupId: 'bravo', selectedViewId: 'focus', matrixViewMode: 'alphabetical' }
		});
		server.requests[0].confirm({ calendar: { showPersonnelRoles: true } });
		await settleReplies();
		expect(server.requests).toHaveLength(2);
		expect(server.requests[1].patch).toEqual({
			calendar: { showStatusText: true },
			training: { selectedGroupId: 'bravo', matrixViewMode: 'alphabetical' }
		});
		expect(state.value).toEqual({
			calendar: { showStatusText: true, showPersonnelRoles: true, highlightOnboarding: true },
			training: { selectedGroupId: 'bravo', selectedViewId: 'focus', matrixViewMode: 'alphabetical' }
		});
		server.requests[1].confirm();
		await settleReplies();
		expect(server.saved).toEqual({
			calendar: { showStatusText: true, showPersonnelRoles: true, highlightOnboarding: true },
			training: { selectedGroupId: 'bravo', selectedViewId: 'focus', matrixViewMode: 'alphabetical' }
		});
	});

	it('finishes the debounce for a newer edit even when the older save settles first', async () => {
		const server = transport();
		const { state } = createState(server);
		state.patch({ training: { selectedGroupId: 'alpha' } });
		await vi.advanceTimersByTimeAsync(350);
		state.patch({ training: { selectedGroupId: 'bravo' } });
		await vi.advanceTimersByTimeAsync(100);
		server.requests[0].confirm();
		await settleReplies();
		expect(state.value.training.selectedGroupId).toBe('bravo');
		await vi.advanceTimersByTimeAsync(249);
		expect(server.requests).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(server.requests[1].patch).toEqual({ training: { selectedGroupId: 'bravo' } });
	});

	it.each([
		['HTTP failure', (request: PendingSave) => request.respond({ message: 'Conflict' }, 409)],
		['transport failure', (request: PendingSave) => request.reject(new Error('Offline'))],
		['null success', (request: PendingSave) => request.respond(null)],
		['partial success', (request: PendingSave) => request.respond({ training: { selectedGroupId: 'alpha' } })],
		[
			'malformed success',
			(request: PendingSave) =>
				request.respond({
					calendar: { showStatusText: true, showPersonnelRoles: false, highlightOnboarding: true },
					training: { selectedGroupId: 'alpha', selectedViewId: null, matrixViewMode: 'unexpected' }
				})
		],
		['unconfirmed success', (request: PendingSave) => request.respond(preferences())],
		['invalid JSON success', (request: PendingSave) => request.resolve(new Response('{broken', { status: 200 }))]
	])('retains unsaved fields after %s and retries all of them on another explicit edit', async (_name, fail) => {
		const server = transport();
		const { state, onError } = createState(server);
		state.patch({ calendar: { showStatusText: true }, training: { selectedGroupId: 'alpha' } });
		await vi.advanceTimersByTimeAsync(350);
		fail(server.requests[0]);
		await settleReplies();
		expect(onError).toHaveBeenCalledTimes(1);
		expect(state.value).toEqual({
			calendar: { showStatusText: true, showPersonnelRoles: false, highlightOnboarding: true },
			training: { selectedGroupId: 'alpha', selectedViewId: null, matrixViewMode: 'by-group' }
		});
		await vi.advanceTimersByTimeAsync(10_000);
		expect(server.requests).toHaveLength(1);
		state.patch({ training: { selectedViewId: 'focus' } });
		await vi.advanceTimersByTimeAsync(350);
		expect(server.requests[1].patch).toEqual({
			calendar: { showStatusText: true },
			training: { selectedGroupId: 'alpha', selectedViewId: 'focus' }
		});
		server.requests[1].confirm();
		await settleReplies();
		expect(server.saved).toEqual({
			calendar: { showStatusText: true, showPersonnelRoles: false, highlightOnboarding: true },
			training: { selectedGroupId: 'alpha', selectedViewId: 'focus', matrixViewMode: 'by-group' }
		});
		expect(onError).toHaveBeenCalledTimes(1);
	});

	it('sends an already-ready newer edit after a failed save with all failed fields still included', async () => {
		const server = transport();
		const { state, onError } = createState(server);
		state.patch({ calendar: { showStatusText: true }, training: { selectedGroupId: 'alpha' } });
		await vi.advanceTimersByTimeAsync(350);
		state.patch({ training: { selectedGroupId: 'bravo', selectedViewId: 'focus' } });
		await vi.advanceTimersByTimeAsync(350);
		server.requests[0].reject(new Error('Offline'));
		await settleReplies();
		expect(onError).toHaveBeenCalledTimes(1);
		expect(server.requests).toHaveLength(2);
		expect(server.requests[1].patch).toEqual({
			calendar: { showStatusText: true },
			training: { selectedGroupId: 'bravo', selectedViewId: 'focus' }
		});
		server.requests[1].confirm();
		await settleReplies();
		expect(server.saved).toEqual({
			calendar: { showStatusText: true, showPersonnelRoles: false, highlightOnboarding: true },
			training: { selectedGroupId: 'bravo', selectedViewId: 'focus', matrixViewMode: 'by-group' }
		});
	});

	it('cancels an undispatched edit on disposal and ignores further edits', async () => {
		const server = transport();
		const { state, onError } = createState(server);
		state.patch({ training: { selectedGroupId: 'alpha' } });
		state.dispose();
		state.patch({ training: { selectedGroupId: 'bravo' } });
		await vi.advanceTimersByTimeAsync(10_000);
		expect(server.requests).toHaveLength(0);
		expect(state.value.training.selectedGroupId).toBe('alpha');
		expect(onError).not.toHaveBeenCalled();
	});

	it.each(['success', 'failure'] as const)(
		'disposal suppresses late %s and cancels already-ready queued work',
		async (reply) => {
			const server = transport();
			const { state, onError } = createState(server);
			state.patch({ training: { selectedGroupId: 'alpha' } });
			await vi.advanceTimersByTimeAsync(350);
			state.patch({ training: { selectedGroupId: 'bravo', selectedViewId: 'focus' } });
			await vi.advanceTimersByTimeAsync(350);
			state.dispose();
			if (reply === 'success') server.requests[0].confirm({ calendar: { showPersonnelRoles: true } });
			else server.requests[0].reject(new Error('Offline'));
			await settleReplies();
			await vi.advanceTimersByTimeAsync(10_000);
			expect(server.requests).toHaveLength(1);
			expect(state.value).toEqual({
				calendar: { showStatusText: false, showPersonnelRoles: false, highlightOnboarding: true },
				training: { selectedGroupId: 'bravo', selectedViewId: 'focus', matrixViewMode: 'by-group' }
			});
			expect(onError).not.toHaveBeenCalled();
		}
	);

	it('suppresses a reply disposed while its successful JSON body is still pending', async () => {
		const server = transport();
		const { state, onError } = createState(server);
		let resolveJson!: (value: unknown) => void;
		const body = new Promise<unknown>((resolve) => {
			resolveJson = resolve;
		});
		state.patch({ training: { selectedGroupId: 'alpha' } });
		await vi.advanceTimersByTimeAsync(350);
		server.requests[0].resolve({ ok: true, json: () => body } as Response);
		await settleReplies();
		state.dispose();
		resolveJson(null);
		await settleReplies();
		expect(state.value.training.selectedGroupId).toBe('alpha');
		expect(onError).not.toHaveBeenCalled();
	});

	it('keeps different users in one Organization and different Organizations independent while replies are held', async () => {
		const serverA = transport();
		const serverB = transport();
		const serverC = transport();
		const a = createState(serverA).state;
		const b = createState(serverB, { userId: 'user-b', orgId: 'org-a', preferences: preferences() }).state;
		const c = createState(serverC, { userId: 'user-a', orgId: 'org-c', preferences: preferences() }).state;
		a.patch({ training: { selectedGroupId: 'alpha' } });
		b.patch({ training: { selectedGroupId: 'bravo' } });
		c.patch({ training: { selectedGroupId: 'charlie' } });
		await vi.advanceTimersByTimeAsync(350);
		expect(serverA.requests).toHaveLength(1);
		expect(serverB.requests).toHaveLength(1);
		expect(serverC.requests).toHaveLength(1);
		expect(serverB.requests[0].url).toBe('/org/org-a/api/user-preferences');
		expect(serverC.requests[0].url).toBe('/org/org-c/api/user-preferences');
		serverB.requests[0].confirm();
		serverC.requests[0].confirm();
		await settleReplies();
		expect(a.value.training.selectedGroupId).toBe('alpha');
		expect(serverB.saved.training.selectedGroupId).toBe('bravo');
		expect(serverC.saved.training.selectedGroupId).toBe('charlie');
	});

	it('recreates the same account/Organization from a fresh seed independently of a disposed in-flight owner', async () => {
		const oldServer = transport();
		const old = createState(oldServer);
		old.state.patch({ training: { selectedGroupId: 'old-group' } });
		await vi.advanceTimersByTimeAsync(350);
		old.state.dispose();
		const newServer = transport();
		const current = createState(newServer);
		expect(current.state.value.training.selectedGroupId).toBeNull();
		current.state.patch({ training: { selectedGroupId: 'fresh-group' } });
		await vi.advanceTimersByTimeAsync(350);
		expect(newServer.requests).toHaveLength(1);
		newServer.requests[0].confirm();
		oldServer.requests[0].confirm();
		await settleReplies();
		expect(current.state.value.training.selectedGroupId).toBe('fresh-group');
		expect(newServer.saved.training.selectedGroupId).toBe('fresh-group');
		expect(old.onError).not.toHaveBeenCalled();
	});
});
