import { describe, expect, it } from 'vitest';
import { getDashboardToolbarActions } from './dashboardToolbarActions';

describe('getDashboardToolbarActions', () => {
	it('routes Add Eval through the first-class Evals route when the member can view rating scheme', () => {
		const actions = getDashboardToolbarActions(
			'org-1',
			{
				canViewTraining: true,
				canViewRatingScheme: true
			},
			'training-evals'
		);

		expect(actions).toContainEqual(expect.objectContaining({ id: 'add-eval', href: '/org/org-1/evals' }));
	});

	it('hides Add Eval when the member lacks rating-scheme view access', () => {
		const actions = getDashboardToolbarActions(
			'org-1',
			{
				canViewTraining: true,
				canViewRatingScheme: false
			},
			'training-evals'
		);

		expect(actions.map((action) => action.id)).not.toContain('add-eval');
	});
});
