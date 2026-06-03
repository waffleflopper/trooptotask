import { describe, expect, it } from 'vitest';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import {
	applyRatedPersonToNewRatingSchemeEntryDraft,
	buildRatingSchemeEntrySaveData,
	createRatingSchemeEntryDraft,
	getRatingSchemeEntryDraftView,
	removeIntermediateRaterFromDraft,
	removeReviewerFromDraft,
	syncAnnualThruDateForRatingSchemeEntryDraft,
	syncReportTypeForRatingSchemeEntryDraft
} from './ratingSchemeEntryDraft';

const baseEntry: RatingSchemeEntry = {
	id: 'entry-1',
	ratedPersonId: 'rated-1',
	evalType: 'NCOER',
	raterPersonId: 'rater-1',
	raterName: null,
	seniorRaterPersonId: 'senior-1',
	seniorRaterName: null,
	intermediateRaterPersonId: null,
	intermediateRaterName: null,
	reviewerPersonId: null,
	reviewerName: null,
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-12-31',
	status: 'active',
	notes: null,
	reportType: 'AN',
	workflowStatus: null
};

describe('Rating Scheme entry draft', () => {
	it('hydrates external intermediate rater and reviewer modes from existing names', () => {
		const draft = createRatingSchemeEntryDraft({
			...baseEntry,
			intermediateRaterName: 'MAJ External IR',
			reviewerName: 'CSM External Reviewer'
		});

		expect(draft.showIntermediate).toBe(true);
		expect(draft.intermediateRater).toEqual({
			mode: 'external',
			personId: '',
			name: 'MAJ External IR'
		});
		expect(draft.showReviewer).toBe(true);
		expect(draft.reviewer).toEqual({
			mode: 'external',
			personId: '',
			name: 'CSM External Reviewer'
		});
	});

	it('builds save data from evaluator modes and trims external names', () => {
		const draft = createRatingSchemeEntryDraft(null);
		draft.ratedPersonId = 'rated-1';
		draft.evalType = 'OER';
		draft.rater.mode = 'external';
		draft.rater.name = '  MAJ Smith, S3  ';
		draft.rater.personId = 'ignored-rater';
		draft.seniorRater.mode = 'internal';
		draft.seniorRater.personId = 'senior-1';
		draft.seniorRater.name = 'ignored senior';
		draft.showIntermediate = true;
		draft.intermediateRater.mode = 'external';
		draft.intermediateRater.name = '  LTC Jones  ';
		draft.showReviewer = true;
		draft.reviewer.mode = 'internal';
		draft.reviewer.personId = 'reviewer-1';
		draft.ratingPeriodStart = '2026-01-01';
		draft.ratingPeriodEnd = '2026-12-31';
		draft.notes = '  command-directed change  ';
		draft.reportType = 'CR';
		draft.showWorkflow = true;
		draft.workflowStatus = 'with-reviewer';

		expect(buildRatingSchemeEntrySaveData(draft)).toMatchObject({
			ratedPersonId: 'rated-1',
			evalType: 'OER',
			raterPersonId: null,
			raterName: 'MAJ Smith, S3',
			seniorRaterPersonId: 'senior-1',
			seniorRaterName: null,
			intermediateRaterPersonId: null,
			intermediateRaterName: 'LTC Jones',
			reviewerPersonId: 'reviewer-1',
			reviewerName: null,
			notes: 'command-directed change',
			reportType: 'CR',
			workflowStatus: 'with-reviewer'
		});
	});

	it('exposes required labels and filters workflow options from visible evaluator sections', () => {
		const draft = createRatingSchemeEntryDraft(null);
		let view = getRatingSchemeEntryDraftView(draft);

		expect(view.canSave).toBe(false);
		expect(view.missingRequiredLabels).toEqual([
			'rated individual',
			'rater',
			'senior rater',
			'rating period start',
			'thru date'
		]);
		expect(view.filteredWorkflowOptions.map((option) => option.value)).not.toContain('with-intermediate-rater');
		expect(view.filteredWorkflowOptions.map((option) => option.value)).not.toContain('with-reviewer');

		draft.showIntermediate = true;
		draft.intermediateRater.name = 'MAJ External IR';
		draft.showReviewer = true;
		draft.reviewer.personId = 'reviewer-1';
		view = getRatingSchemeEntryDraftView(draft);

		expect(view.filteredWorkflowOptions.map((option) => option.value)).toContain('with-intermediate-rater');
		expect(view.filteredWorkflowOptions.map((option) => option.value)).toContain('with-reviewer');
	});

	it('keeps report type and automatic Annual thru-date rules in one module', () => {
		const draft = createRatingSchemeEntryDraft(null);
		draft.evalType = 'OER';
		draft.reportType = 'RO';
		syncReportTypeForRatingSchemeEntryDraft(draft);
		expect(draft.reportType).toBe('');

		draft.reportType = 'AN';
		draft.ratingPeriodStart = '2026-04-01';
		syncAnnualThruDateForRatingSchemeEntryDraft(draft, null);
		expect(draft.ratingPeriodEnd).toBe('2027-03-31');
		expect(draft.autoFilledEnd).toBe(true);
	});

	it('applies rated individual rank only for new drafts and clears optional sections through module commands', () => {
		const draft = createRatingSchemeEntryDraft(null);
		draft.ratedPersonId = 'rated-1';
		applyRatedPersonToNewRatingSchemeEntryDraft(draft, null, [
			{ id: 'rated-1', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }
		]);
		expect(draft.evalType).toBe('OER');

		draft.showIntermediate = true;
		draft.intermediateRater.personId = 'ir-1';
		draft.intermediateRater.name = 'ignored';
		draft.workflowStatus = 'ir-signed';
		removeIntermediateRaterFromDraft(draft);
		expect(draft.showIntermediate).toBe(false);
		expect(draft.intermediateRater.personId).toBe('');
		expect(draft.intermediateRater.name).toBe('');
		expect(draft.workflowStatus).toBe('');

		draft.showReviewer = true;
		draft.reviewer.personId = 'reviewer-1';
		draft.workflowStatus = 'with-reviewer';
		removeReviewerFromDraft(draft);
		expect(draft.showReviewer).toBe(false);
		expect(draft.reviewer.personId).toBe('');
		expect(draft.workflowStatus).toBe('');
	});
});
