import { afterEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';
import { settles } from '$lib/test-support/settles';
import { personnelStore } from '$features/personnel/stores/personnel.svelte';
import { archivePersonnel } from './archivePersonnel';
import type { Personnel } from '../personnel.types';

const person = { id: 'person-a', rank: 'SPC', firstName: 'Avery', lastName: 'Able' } as Personnel;

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('archivePersonnel outside the loaded roster', () => {
	it.each([
		['archive', () => new Response(null, { status: 200 })],
		['failure', () => new Response(null, { status: 503 })]
	] as const)('reports no %s that arrives after the Organization shell ends', async (_outcome, response) => {
		let respond!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>((resolve) => (respond = resolve)))
		);
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		const error = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const requestArchiveApproval = vi.fn();

		const pending = archivePersonnel({ orgId: 'org-not-loaded', person, requestArchiveApproval });
		endOrganizationLifetime();
		respond(response());

		expect(await settles(pending)).toBe(false);
		expect(success).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
		expect(requestArchiveApproval).not.toHaveBeenCalled();
	});
});

describe('archivePersonnel Undo', () => {
	const archivedReply = (body: unknown) => vi.fn(async () => Response.json(body));
	const requestArchiveApproval = vi.fn();

	it('offers Undo for ten seconds with the token the server issued, and drops the Person from the loaded roster', async () => {
		personnelStore.load([person], 'org-1');
		vi.stubGlobal('fetch', archivedReply({ success: true, undo: 'token-1' }));
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');

		await expect(archivePersonnel({ orgId: 'org-1', person, requestArchiveApproval })).resolves.toBe('archived');

		expect(success.mock.calls.map(([, duration, action]) => [duration, action])).toEqual([
			[10_000, { label: 'Undo', onClick: expect.any(Function) }]
		]);
		expect(personnelStore.getById('person-a')).toBeUndefined();
	});

	it('offers no Undo when the server issued no token', async () => {
		vi.stubGlobal('fetch', archivedReply({ success: true }));
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');

		await archivePersonnel({ orgId: 'org-1', person, requestArchiveApproval });

		expect(success.mock.calls.map(([, duration, action]) => [duration, action])).toEqual([[undefined, undefined]]);
	});

	it('sends nothing when Undo is pressed after the Organization shell ends', async () => {
		const fetchMock = archivedReply({ success: true, undo: 'token-1' });
		vi.stubGlobal('fetch', fetchMock);
		const success = vi.spyOn(toastStore, 'success').mockImplementation(() => 'toast-id');
		await archivePersonnel({ orgId: 'org-1', person, requestArchiveApproval });

		endOrganizationLifetime();
		success.mock.calls[0][2]?.onClick();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
