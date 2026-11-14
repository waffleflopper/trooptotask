import { describe, expect, it } from 'vitest';
import { line, linePersonnel } from './ratingSchemeLineTestData';
import {
	applyRatedPersonToLineDraft,
	buildRatingSchemeLineValues,
	createRatingSchemeLineDraft,
	missingLineFields,
	planRatingSchemeLineSave
} from './ratingSchemeLineDraft';

describe('rating scheme line draft', () => {
	it('round-trips a line into the values it was loaded from', () => {
		const source = line('a', { intermediateRaterName: 'Outside IR', notes: 'Moves in March' });
		const values = buildRatingSchemeLineValues(createRatingSchemeLineDraft(source));
		expect(values).toMatchObject({
			ratedPersonId: 'watanabe',
			evalType: 'NCOER',
			raterPersonId: 'alvarez',
			seniorRaterPersonId: 'chen',
			intermediateRaterPersonId: null,
			intermediateRaterName: 'Outside IR',
			reviewerPersonId: null,
			notes: 'Moves in March'
		});
	});

	it('drops an intermediate rater or reviewer that was hidden again', () => {
		const draft = createRatingSchemeLineDraft(line('a', { reviewerPersonId: 'reyes' }));
		draft.showReviewer = false;
		expect(buildRatingSchemeLineValues(draft).reviewerPersonId).toBeNull();
	});

	it('requires the Rated Soldier, the rater and the senior rater, and nothing else', () => {
		const draft = createRatingSchemeLineDraft(null);
		expect(missingLineFields(draft)).toEqual(['ratedPerson', 'rater', 'seniorRater']);
		draft.ratedPersonId = 'park';
		draft.rater = { kind: 'external', name: '   ' };
		draft.seniorRater = { kind: 'person', personId: 'chen' };
		expect(missingLineFields(draft)).toEqual(['rater']);
	});

	it('takes the eval type from the Rated Soldier rank', () => {
		const draft = createRatingSchemeLineDraft(null);
		draft.ratedPersonId = 'reyes';
		applyRatedPersonToLineDraft(draft, linePersonnel);
		expect(draft.evalType).toBe('OER');
		draft.ratedPersonId = 'park';
		applyRatedPersonToLineDraft(draft, linePersonnel);
		expect(draft.evalType).toBe('NCOER');
	});
});

describe('planRatingSchemeLineSave', () => {
	const opened = buildRatingSchemeLineValues(createRatingSchemeLineDraft(line('a')));

	it('is empty when nothing changed', () => {
		expect(planRatingSchemeLineSave(opened, { ...opened })).toBeNull();
	});

	it('carries only the fields the edit changed', () => {
		expect(
			planRatingSchemeLineSave(opened, { ...opened, seniorRaterPersonId: 'reyes', notes: 'New senior rater' })
		).toEqual({ seniorRaterPersonId: 'reyes', notes: 'New senior rater' });
	});

	it('clears a role by sending null', () => {
		const withReviewer = { ...opened, reviewerPersonId: 'reyes' };
		expect(planRatingSchemeLineSave(withReviewer, { ...withReviewer, reviewerPersonId: null })).toEqual({
			reviewerPersonId: null
		});
	});
});
