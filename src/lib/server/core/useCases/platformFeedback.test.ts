import { describe, expect, it, vi } from 'vitest';
import { createInMemoryPlatformFeedbackStore } from '$lib/server/adapters/inMemoryPlatformFeedback';
import { createPlatformFeedback } from './platformFeedback';

const FIRST_ID = '11111111-1111-1111-1111-111111111111';
const SECOND_ID = '22222222-2222-2222-2222-222222222222';
const MISSING_ID = '33333333-3333-3333-3333-333333333333';

function makeFeedback() {
	const store = createInMemoryPlatformFeedbackStore({
		items: [
			{
				id: FIRST_ID,
				userEmail: 'old@example.com',
				category: 'bug',
				message: 'Older feedback',
				createdAt: '2026-06-01T10:00:00.000Z',
				organizationName: 'Alpha',
				pageUrl: '/org/alpha/dashboard',
				status: 'new',
				adminNotes: null
			},
			{
				id: SECOND_ID,
				userEmail: 'new@example.com',
				category: 'feature',
				message: 'Newer feedback',
				createdAt: '2026-06-02T10:00:00.000Z',
				organizationName: null,
				pageUrl: null,
				status: 'reviewed',
				adminNotes: 'Needs product review'
			}
		]
	});

	return createPlatformFeedback({ store });
}

describe('PlatformFeedback', () => {
	it('lists feedback newest first through the public interface', async () => {
		const feedback = makeFeedback();

		const result = await feedback.list();

		expect(result.map((item) => item.id)).toEqual([SECOND_ID, FIRST_ID]);
		expect(result[0]).toMatchObject({
			userEmail: 'new@example.com',
			category: 'feature',
			status: 'reviewed',
			adminNotes: 'Needs product review'
		});
	});

	it('updates feedback status and admin notes', async () => {
		const feedback = makeFeedback();

		await expect(
			feedback.update({
				id: FIRST_ID,
				status: 'resolved',
				adminNotes: 'Handled by support'
			})
		).resolves.toEqual({ status: 'updated', id: FIRST_ID });

		await expect(feedback.list()).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: FIRST_ID,
					status: 'resolved',
					adminNotes: 'Handled by support'
				})
			])
		);
	});

	it('returns not-found when feedback cannot be updated', async () => {
		const feedback = makeFeedback();

		await expect(feedback.update({ id: MISSING_ID, status: 'reviewed' })).resolves.toEqual({ status: 'not_found' });
	});

	it('returns an empty list when the store list fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const feedback = createPlatformFeedback({
			store: createInMemoryPlatformFeedbackStore({
				listError: new Error('list failed')
			})
		});

		await expect(feedback.list()).resolves.toEqual([]);
		expect(consoleError).toHaveBeenCalledWith('Failed to fetch feedback:', expect.any(Error));
		consoleError.mockRestore();
	});

	it('propagates store failures while updating feedback', async () => {
		const feedback = createPlatformFeedback({
			store: createInMemoryPlatformFeedbackStore({
				updateError: new Error('update failed')
			})
		});

		await expect(feedback.update({ id: FIRST_ID, status: 'reviewed' })).rejects.toThrow('update failed');
	});
});
