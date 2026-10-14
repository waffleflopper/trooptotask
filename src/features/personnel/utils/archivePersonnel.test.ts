import { afterEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';
import { settles } from '$lib/test-support/settles';
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
