import { describe, expect, it } from 'vitest';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import {
	applyRatedPersonToNewRatingSchemeEntryDraft,
	buildRatingSchemeEntrySaveData,
	createRatingSchemeEntryDraft,
	getRatingSchemeEntryDraftView,
	removeIntermediateRaterFromDraft,
	removeReviewerFromDraft,
	setEvaluatorFromPicker,
	syncAnnualThruDateForRatingSchemeEntryDraft,
	syncReportTypeForRatingSchemeEntryDraft,
	type EvaluatorDraft
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
	notes: null,
	reportType: 'AN',
	workflowStatus: null
};

describe('Rating Scheme entry draft', () => {
	it.each([
		{
			kind: 'empty',
			personId: null,
			name: null,
			expectedDraft: { kind: 'empty' },
			expectedPayload: {
				ratedPersonId: 'rated-1',
				evalType: 'NCOER',
				raterPersonId: null,
				raterName: null,
				seniorRaterPersonId: null,
				seniorRaterName: null,
				intermediateRaterPersonId: null,
				intermediateRaterName: null,
				reviewerPersonId: null,
				reviewerName: null,
				ratingPeriodStart: '2026-01-01',
				ratingPeriodEnd: '2026-12-31',
				notes: null,
				reportType: 'AN'
			}
		},
		{
			kind: 'person',
			personId: 'evaluator-1',
			name: 'ignored external name',
			expectedDraft: { kind: 'person', personId: 'evaluator-1' },
			expectedPayload: {
				ratedPersonId: 'rated-1',
				evalType: 'NCOER',
				raterPersonId: 'evaluator-1',
				raterName: null,
				seniorRaterPersonId: 'evaluator-1',
				seniorRaterName: null,
				intermediateRaterPersonId: 'evaluator-1',
				intermediateRaterName: null,
				reviewerPersonId: 'evaluator-1',
				reviewerName: null,
				ratingPeriodStart: '2026-01-01',
				ratingPeriodEnd: '2026-12-31',
				notes: null,
				reportType: 'AN'
			}
		},
		{
			kind: 'external',
			personId: null,
			name: '  MAJ Smith, S3  ',
			expectedDraft: { kind: 'external', name: '  MAJ Smith, S3  ' },
			expectedPayload: {
				ratedPersonId: 'rated-1',
				evalType: 'NCOER',
				raterPersonId: null,
				raterName: 'MAJ Smith, S3',
				seniorRaterPersonId: null,
				seniorRaterName: 'MAJ Smith, S3',
				intermediateRaterPersonId: null,
				intermediateRaterName: 'MAJ Smith, S3',
				reviewerPersonId: null,
				reviewerName: 'MAJ Smith, S3',
				ratingPeriodStart: '2026-01-01',
				ratingPeriodEnd: '2026-12-31',
				notes: null,
				reportType: 'AN'
			}
		}
	])(
		'round-trips every evaluator role as $kind with the existing full save payload',
		({ personId, name, expectedDraft, expectedPayload }) => {
			const draft = createRatingSchemeEntryDraft({
				...baseEntry,
				raterPersonId: personId,
				raterName: name,
				seniorRaterPersonId: personId,
				seniorRaterName: name,
				intermediateRaterPersonId: personId,
				intermediateRaterName: name,
				reviewerPersonId: personId,
				reviewerName: name
			});
			expect(draft.rater).toEqual(expectedDraft);
			expect(draft.seniorRater).toEqual(expectedDraft);
			expect(draft.intermediateRater).toEqual(expectedDraft);
			expect(draft.reviewer).toEqual(expectedDraft);
			expect(buildRatingSchemeEntrySaveData(draft)).toEqual(expectedPayload);
		}
	);

	it('omits hidden optional roles while preserving all other save fields', () => {
		const draft = createRatingSchemeEntryDraft({
			...baseEntry,
			evalType: 'OER',
			reportType: 'CR',
			intermediateRaterName: 'MAJ Hidden IR',
			reviewerPersonId: 'hidden-reviewer',
			workflowStatus: 'with-reviewer',
			notes: '  command-directed change  '
		});
		draft.showIntermediate = false;
		draft.showReviewer = false;
		expect(buildRatingSchemeEntrySaveData(draft)).toEqual({
			ratedPersonId: 'rated-1',
			evalType: 'OER',
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
			notes: 'command-directed change',
			reportType: 'CR'
		});
	});

	it.each([
		[null, { kind: 'empty' }],
		[{ personId: 'person-1' }, { kind: 'person', personId: 'person-1' }],
		[{ personId: '' }, { kind: 'empty' }],
		[{ externalName: '  COL External  ' }, { kind: 'external', name: 'COL External' }],
		[{ externalName: ' \t ' }, { kind: 'empty' }]
	] satisfies [Parameters<typeof setEvaluatorFromPicker>[0], EvaluatorDraft][])(
		'normalizes picker selection %j',
		(value, expected) => {
			expect(setEvaluatorFromPicker(value)).toEqual(expected);
		}
	);

	it('reports required fields in sheet focus order and rejects trimmed-blank external names', () => {
		const draft = createRatingSchemeEntryDraft(null);
		expect(getRatingSchemeEntryDraftView(draft).missingRequired).toEqual([
			'ratedPerson',
			'ratingPeriodStart',
			'ratingPeriodEnd',
			'rater',
			'seniorRater'
		]);
		draft.ratedPersonId = 'rated-1';
		draft.ratingPeriodStart = '2026-01-01';
		draft.ratingPeriodEnd = '2026-12-31';
		draft.rater = { kind: 'external', name: '  ' };
		draft.seniorRater = { kind: 'external', name: '\t ' };
		expect(getRatingSchemeEntryDraftView(draft).missingRequired).toEqual(['rater', 'seniorRater']);
		expect(getRatingSchemeEntryDraftView(draft).canSave).toBe(false);
		expect(buildRatingSchemeEntrySaveData(draft).raterName).toBeNull();
		expect(buildRatingSchemeEntrySaveData(draft).seniorRaterName).toBeNull();
		draft.rater = setEvaluatorFromPicker({ externalName: 'MAJ External' });
		draft.seniorRater = setEvaluatorFromPicker({ personId: 'senior-1' });
		expect(getRatingSchemeEntryDraftView(draft).missingRequired).toEqual([]);
		expect(getRatingSchemeEntryDraftView(draft).canSave).toBe(true);
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

	it('applies rank only for new entries and clears removed evaluators', () => {
		const draft = createRatingSchemeEntryDraft(baseEntry);
		const personnel = [{ id: 'rated-1', rank: 'CPT', firstName: 'Alex', lastName: 'Jones' }];
		applyRatedPersonToNewRatingSchemeEntryDraft(draft, baseEntry, personnel);
		expect(draft.evalType).toBe('NCOER');
		applyRatedPersonToNewRatingSchemeEntryDraft(draft, null, personnel);
		expect(draft.evalType).toBe('OER');
		draft.showIntermediate = true;
		draft.intermediateRater = { kind: 'person', personId: 'ir-1' };
		removeIntermediateRaterFromDraft(draft);
		expect(draft.showIntermediate).toBe(false);
		expect(draft.intermediateRater).toEqual({ kind: 'empty' });
		draft.showReviewer = true;
		draft.reviewer = { kind: 'external', name: 'COL Reviewer' };
		removeReviewerFromDraft(draft);
		expect(draft.showReviewer).toBe(false);
		expect(draft.reviewer).toEqual({ kind: 'empty' });
	});
});
