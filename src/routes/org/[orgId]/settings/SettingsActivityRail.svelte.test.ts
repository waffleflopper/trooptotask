// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';

import SettingsActivityRail from './SettingsActivityRail.svelte';
import type { DeletionRequestApproval } from '$features/deletion-requests/contracts';

const navigation = vi.hoisted(() => ({ invalidateAll: vi.fn() }));
const feedback = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }));
vi.mock('$app/navigation', () => ({
	invalidateAll: navigation.invalidateAll
}));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: feedback }));

beforeEach(() => {
	navigation.invalidateAll.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

function request(id: string, description: string): DeletionRequestApproval {
	return {
		id,
		status: 'pending',
		requested_by_email: 'requester@example.com',
		resource_description: description,
		resource_type: 'personnel',
		resource_url: null,
		created_at: '2026-04-26T12:00:00Z',
		denial_reason: null
	};
}

const approvalRequests = [request('request-1', 'Archived record A'), request('request-2', 'Archived record B')];

const auditLog = {
	logs: [
		{
			id: 'audit-1',
			userId: 'user-1',
			actor: 'admin@example.com',
			action: 'organization.rename',
			resourceType: 'organization',
			resourceId: 'org-1',
			details: { name: 'Test Org' },
			createdAt: '2026-04-26T12:00:00Z'
		}
	],
	totalCount: 1,
	last30DaysCount: 1,
	page: 1,
	limit: 100,
	actionFilter: '',
	availableActions: ['organization.rename']
};

function mount() {
	return render(SettingsActivityRail, {
		orgId: 'org-1',
		activity: { pendingApprovalsCount: 2, approvalRequests, auditLog }
	});
}

function card(description: string) {
	const element = screen.getAllByRole('article').find((article) => within(article).queryByText(description));
	if (!element) throw new Error(`Missing request card: ${description}`);
	return within(element);
}

async function draft(description = 'Archived record A', reason = 'Still required') {
	await fireEvent.click(card(description).getByRole('button', { name: 'Deny' }));
	await fireEvent.input(screen.getByRole('textbox', { name: 'Denial reason' }), { target: { value: reason } });
}

function reason() {
	return screen.getByRole('textbox', { name: 'Denial reason' }) as HTMLInputElement;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('SettingsActivityRail', () => {
	it('identifies the saved requester while preserving activity tab and collapse interactions', async () => {
		mount();

		const activity = screen.getByRole('complementary', { name: 'Settings activity' });
		expect(within(activity).getByRole('tab', { name: /Approvals 2/ })).toBeTruthy();
		expect(card('Archived record A').getByText('requester@example.com')).toBeTruthy();

		await fireEvent.click(within(activity).getByRole('tab', { name: 'Audit Log' }));
		expect(within(activity).getByRole('columnheader', { name: 'Area' })).toBeTruthy();
		expect(within(activity).getByRole('columnheader', { name: 'Event' })).toBeTruthy();
		expect(within(activity).getByRole('cell', { name: 'Organization' })).toBeTruthy();
		expect(within(activity).getByRole('cell', { name: 'Rename' })).toBeTruthy();
		expect(within(activity).getByText('admin@example.com')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
		expect(screen.getByRole('button', { name: 'Show activity panel' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Show activity panel' }));
		expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
	});

	it('starts a fresh denial draft for a different request', async () => {
		mount();
		await draft();
		await fireEvent.click(card('Archived record B').getByRole('button', { name: 'Deny' }));
		expect(reason().value).toBe('');
	});

	it('keeps every review and draft control busy without keyboard changes during a review', async () => {
		const pending = deferred<Response>();
		const send = vi.fn(() => pending.promise);
		vi.stubGlobal('fetch', send);
		mount();
		await draft();
		await fireEvent.click(card('Archived record A').getByRole('button', { name: /Confirm/ }));
		expect(reason().disabled).toBe(true);
		for (const name of ['Approve', 'Deny']) {
			expect((card('Archived record B').getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
		}
		expect((card('Archived record A').getByRole('button', { name: /Confirm/ }) as HTMLButtonElement).disabled).toBe(
			true
		);
		await fireEvent.keyDown(reason(), { key: 'Escape' });
		await fireEvent.keyDown(reason(), { key: 'Enter' });
		expect(reason().value).toBe('Still required');
		expect(send).toHaveBeenCalledOnce();
		pending.resolve(Response.json({ message: 'Review unavailable' }, { status: 503 }));
		await waitFor(() => expect(feedback.error).toHaveBeenCalledOnce());
		expect(reason().disabled).toBe(false);
		expect(reason().value).toBe('Still required');
	});

	it.each(['response', 'transport', 'null', 'malformed', 'non-string message'] as const)(
		'retains the denial draft and allows an explicit retry after a %s failure',
		async (kind) => {
			const failure =
				kind === 'transport'
					? () => Promise.reject(new Error('Connection unavailable'))
					: () =>
							Promise.resolve(
								kind === 'malformed'
									? new Response('{', { status: 503 })
									: Response.json(
											kind === 'response' ? { message: 'Review unavailable' } : kind === 'null' ? null : { message: 7 },
											{ status: 503 }
										)
							);
			const send = vi
				.fn()
				.mockImplementationOnce(failure)
				.mockResolvedValueOnce(new Response(null, { status: 200 }));
			vi.stubGlobal('fetch', send);
			mount();
			await draft();
			await fireEvent.keyDown(reason(), { key: 'Enter' });
			await waitFor(() => expect(feedback.error).toHaveBeenCalledOnce());
			expect(feedback.error.mock.calls[0][0]).toEqual(expect.any(String));
			expect(feedback.error.mock.calls[0][0].length).toBeGreaterThan(0);
			if (kind === 'response') expect(feedback.error.mock.calls[0][0]).toContain('Review unavailable');
			expect(reason().value).toBe('Still required');
			expect(reason().disabled).toBe(false);
			expect(send).toHaveBeenCalledOnce();
			expect(navigation.invalidateAll).not.toHaveBeenCalled();
			await fireEvent.click(card('Archived record A').getByRole('button', { name: /Confirm/ }));
			await waitFor(() => expect(navigation.invalidateAll).toHaveBeenCalledOnce());
			expect(send).toHaveBeenCalledTimes(2);
			for (const [, init] of send.mock.calls as [string, RequestInit][]) {
				expect(JSON.parse(init.body as string)).toEqual({
					id: 'request-1',
					action: 'deny',
					denialReason: 'Still required'
				});
			}
			expect(screen.queryByText('Archived record A')).toBeNull();
		}
	);

	it('preserves an unrelated denial draft when a different request is acknowledged', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		mount();
		await draft();
		await fireEvent.click(card('Archived record B').getByRole('button', { name: 'Approve' }));
		await waitFor(() => expect(navigation.invalidateAll).toHaveBeenCalledOnce());
		expect(screen.queryByText('Archived record B')).toBeNull();
		expect(reason().value).toBe('Still required');
		expect(reason().disabled).toBe(false);
	});

	it('reports an acknowledged review separately from refresh failure without offering the mutation again', async () => {
		const refresh = deferred<void>();
		navigation.invalidateAll.mockReturnValueOnce(refresh.promise);
		const send = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', send);
		mount();
		await fireEvent.click(card('Archived record A').getByRole('button', { name: 'Approve' }));
		await waitFor(() => expect(navigation.invalidateAll).toHaveBeenCalledOnce());
		expect(screen.queryByText('Archived record A')).toBeNull();
		expect(screen.getByRole('tab', { name: /Approvals 1/ })).toBeTruthy();
		expect((card('Archived record B').getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
			true
		);
		refresh.reject(new Error('Readback unavailable'));
		await refresh.promise.catch(() => undefined);
		await waitFor(() => expect(feedback.warning).toHaveBeenCalledOnce());
		expect(feedback.warning.mock.calls[0][0]).toEqual(expect.stringMatching(/review.*(complete|approv|deni)/i));
		expect(feedback.warning.mock.calls[0][0]).toEqual(expect.stringMatching(/refresh/i));
		expect(feedback.error).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledOnce();
		expect(screen.queryByText('Archived record A')).toBeNull();
		expect(screen.getByRole('tab', { name: /Approvals 1/ })).toBeTruthy();
		expect((card('Archived record B').getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
			false
		);
		await tick();
		expect(send).toHaveBeenCalledOnce();
	});
});
