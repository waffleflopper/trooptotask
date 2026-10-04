import { describe, expect, it } from 'vitest';
import { createInMemoryFeedbackStore } from './inMemoryFeedback.server';
import { createFeedbackReview } from './feedbackReview.server';

const FIRST_ID = '11111111-1111-1111-1111-111111111111';
const SECOND_ID = '22222222-2222-2222-2222-222222222222';
const MISSING_ID = '33333333-3333-3333-3333-333333333333';

function makeFeedback() {
	const store = createInMemoryFeedbackStore({
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

	return createFeedbackReview(store);
}

describe('Feedback review', () => {
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

	it('allows feedback admin notes to be cleared through the public interface', async () => {
		const feedback = makeFeedback();

		await expect(feedback.update({ id: SECOND_ID, adminNotes: null })).resolves.toEqual({
			status: 'updated',
			id: SECOND_ID
		});

		await expect(feedback.list()).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: SECOND_ID,
					status: 'reviewed',
					adminNotes: null
				})
			])
		);
	});

	it('returns not-found when feedback cannot be updated', async () => {
		const feedback = makeFeedback();

		await expect(feedback.update({ id: MISSING_ID, status: 'reviewed' })).resolves.toEqual({ status: 'not_found' });
	});

	it('propagates a failed review list instead of reporting an empty queue', async () => {
		const feedback = createFeedbackReview(createInMemoryFeedbackStore({ listError: new Error('list failed') }));
		await expect(feedback.list()).rejects.toThrow('list failed');
	});

	it('propagates store failures while updating feedback', async () => {
		const feedback = createFeedbackReview(
			createInMemoryFeedbackStore({
				updateError: new Error('update failed')
			})
		);

		await expect(feedback.update({ id: FIRST_ID, status: 'reviewed' })).rejects.toThrow('update failed');
	});
});
