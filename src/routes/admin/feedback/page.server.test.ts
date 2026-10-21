import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type { PageData } from './$types';

const { feedbackMock, createOperationsMock } = vi.hoisted(() => {
	const feedback = {
		list: vi.fn(),
		update: vi.fn()
	};

	return {
		feedbackMock: feedback,
		createOperationsMock: vi.fn(() => feedback)
	};
});

vi.mock('$features/platform-admin/index.server', () => ({
	createPlatformFeedbackOperations: createOperationsMock
}));

import { actions, load } from './+page.server';

const FEEDBACK_ID = '11111111-1111-1111-1111-111111111111';

function makeRequest(form: Record<string, string>): Request {
	return new Request('http://localhost/admin/feedback', {
		method: 'POST',
		body: new URLSearchParams(form)
	});
}

describe('admin feedback route shell', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('groups feedback by saved status in the existing page shape', async () => {
		feedbackMock.list.mockResolvedValueOnce([
			{
				id: FEEDBACK_ID,
				userEmail: 'tester@example.com',
				category: 'bug',
				message: 'The dashboard is slow',
				createdAt: '2026-06-03T10:00:00.000Z',
				organizationName: 'Alpha',
				pageUrl: '/org/alpha/dashboard',
				status: 'new',
				adminNotes: null
			},
			{
				id: '22222222-2222-2222-2222-222222222222',
				userEmail: 'reviewed@example.com',
				category: 'feature',
				message: 'Add a report export',
				createdAt: '2026-06-02T10:00:00.000Z',
				organizationName: null,
				pageUrl: null,
				status: 'reviewed',
				adminNotes: 'Follow up later'
			}
		]);

		const result = (await load({} as unknown as Parameters<typeof load>[0])) as PageData;

		expect(result).toEqual({
			newItems: [
				{
					id: FEEDBACK_ID,
					user_email: 'tester@example.com',
					category: 'bug',
					message: 'The dashboard is slow',
					created_at: '2026-06-03T10:00:00.000Z',
					organization_name: 'Alpha',
					page_url: '/org/alpha/dashboard',
					status: 'new',
					admin_notes: null
				}
			],
			reviewedItems: [
				{
					id: '22222222-2222-2222-2222-222222222222',
					user_email: 'reviewed@example.com',
					category: 'feature',
					message: 'Add a report export',
					created_at: '2026-06-02T10:00:00.000Z',
					organization_name: null,
					page_url: null,
					status: 'reviewed',
					admin_notes: 'Follow up later'
				}
			],
			resolvedItems: []
		});
	});

	it('preserves validation failures before calling the use case', async () => {
		const missing = await actions.update({
			request: makeRequest({ status: 'reviewed' })
		} as unknown as Parameters<(typeof actions)['update']>[0]);
		expect(missing).toEqual({ status: 400, data: { error: 'Missing feedback ID' } });

		const invalidStatus = await actions.update({
			request: makeRequest({ feedbackId: FEEDBACK_ID, status: 'ignored' })
		} as unknown as Parameters<(typeof actions)['update']>[0]);
		expect(invalidStatus).toEqual({ status: 400, data: { error: 'Invalid status' } });
		expect(feedbackMock.update).not.toHaveBeenCalled();
	});

	it('maps missing feedback and store failures to user-facing failure shapes', async () => {
		feedbackMock.update.mockResolvedValueOnce({ status: 'not_found' });
		const missing = await actions.update({
			request: makeRequest({ feedbackId: FEEDBACK_ID, status: 'reviewed' })
		} as unknown as Parameters<(typeof actions)['update']>[0]);
		expect(missing).toEqual({ status: 404, data: { error: 'Feedback not found' } });

		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		feedbackMock.update.mockRejectedValueOnce(new Error('update failed'));
		const failure = await actions.update({
			request: makeRequest({ feedbackId: FEEDBACK_ID, status: 'reviewed' })
		} as unknown as Parameters<(typeof actions)['update']>[0]);
		expect(failure).toEqual({ status: 500, data: { error: 'Failed to update feedback' } });
		expect(consoleError).toHaveBeenCalledWith('Failed to update feedback:', expect.any(Error));
		consoleError.mockRestore();
	});
	it('reports a failed collection read without disclosing provider details', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		feedbackMock.list.mockRejectedValueOnce(new Error('private provider failure'));
		try {
			await load({} as Parameters<typeof load>[0]);
			expect.unreachable('Expected failed collection load');
		} catch (cause) {
			expect(isHttpError(cause, 500)).toBe(true);
			if (!isHttpError(cause)) throw cause;
			expect(cause.body.message).not.toContain('private provider');
		} finally {
			consoleError.mockRestore();
		}
	});
});
