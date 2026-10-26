import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType } from '../training.types';
import {
	applicabilityMatches,
	newTrainingTypeDraft,
	trainingTypeDraftFrom,
	trainingTypeInputFromDraft,
	validateTrainingTypeDraft,
	type ApplicabilityDraft,
	type RenewalDraft
} from './trainingTypeDraft';

function savedType(fields: Partial<TrainingType> = {}): TrainingType {
	return {
		id: 'cls',
		name: 'CLS',
		description: '  Sustainment training  ',
		color: '#123456',
		expirationMonths: 12,
		expirationDateOnly: false,
		warningDaysYellow: 45,
		warningDaysOrange: 15,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		isOptional: false,
		canBeExempted: true,
		exemptPersonnelIds: ['exempt-person'],
		sortOrder: 7,
		...fields
	};
}

const renewalCases: {
	label: string;
	saved: Partial<TrainingType>;
	draft: RenewalDraft;
	payload: Partial<TrainingType>;
}[] = [
	{
		label: 'months',
		saved: { expirationMonths: 24, expirationDateOnly: false, warningDaysYellow: 45, warningDaysOrange: 15 },
		draft: { kind: 'months', months: 24, firstWarningDays: 45, finalWarningDays: 15 },
		payload: { expirationMonths: 24, expirationDateOnly: false, warningDaysYellow: 45, warningDaysOrange: 15 }
	},
	{
		label: 'card date',
		saved: { expirationMonths: null, expirationDateOnly: true, warningDaysYellow: 75, warningDaysOrange: 25 },
		draft: { kind: 'cardDate', firstWarningDays: 75, finalWarningDays: 25 },
		payload: { expirationMonths: null, expirationDateOnly: true, warningDaysYellow: 75, warningDaysOrange: 25 }
	},
	{
		label: 'card date with a stored interval',
		saved: { expirationMonths: 18, expirationDateOnly: true, warningDaysYellow: 75, warningDaysOrange: 25 },
		draft: { kind: 'cardDate', firstWarningDays: 75, finalWarningDays: 25 },
		payload: { expirationMonths: 18, expirationDateOnly: true, warningDaysYellow: 75, warningDaysOrange: 25 }
	},
	{
		label: 'never',
		saved: { expirationMonths: null, expirationDateOnly: false, warningDaysYellow: 10, warningDaysOrange: 20 },
		draft: { kind: 'never' },
		payload: { expirationMonths: null, expirationDateOnly: false, warningDaysYellow: 10, warningDaysOrange: 20 }
	}
];

const applicabilityCases: {
	label: string;
	saved: Partial<TrainingType>;
	draft: ApplicabilityDraft;
	payload: Partial<TrainingType>;
}[] = [
	{
		label: 'everyone',
		saved: {},
		draft: { mode: 'everyone', only: [], except: [] },
		payload: {
			appliesToRoles: [],
			appliesToMos: [],
			appliesToRanks: [],
			excludedRoles: [],
			excludedMos: [],
			excludedRanks: [],
			isOptional: false
		}
	},
	{
		label: 'everyone with exceptions',
		saved: { excludedRoles: ['Driver'], excludedMos: ['68W'], excludedRanks: ['CPT'] },
		draft: {
			mode: 'everyone',
			only: [],
			except: [
				{ kind: 'role', value: 'Driver' },
				{ kind: 'mos', value: '68W' },
				{ kind: 'rank', value: 'CPT' }
			]
		},
		payload: {
			appliesToRoles: [],
			appliesToMos: [],
			appliesToRanks: [],
			excludedRoles: ['Driver'],
			excludedMos: ['68W'],
			excludedRanks: ['CPT'],
			isOptional: false
		}
	},
	{
		label: 'only some with mixed chips',
		saved: { appliesToRoles: ['Driver', 'Medic'], appliesToMos: ['88M'], appliesToRanks: ['SGT'] },
		draft: {
			mode: 'onlySome',
			only: [
				{ kind: 'role', value: 'Driver' },
				{ kind: 'role', value: 'Medic' },
				{ kind: 'mos', value: '88M' },
				{ kind: 'rank', value: 'SGT' }
			],
			except: []
		},
		payload: {
			appliesToRoles: ['Driver', 'Medic'],
			appliesToMos: ['88M'],
			appliesToRanks: ['SGT'],
			excludedRoles: [],
			excludedMos: [],
			excludedRanks: [],
			isOptional: false
		}
	},
	{
		label: 'only some with exceptions',
		saved: { appliesToMos: ['68W'], excludedRoles: ['NCO'], excludedMos: ['88M'], excludedRanks: ['CPT'] },
		draft: {
			mode: 'onlySome',
			only: [{ kind: 'mos', value: '68W' }],
			except: [
				{ kind: 'role', value: 'NCO' },
				{ kind: 'mos', value: '88M' },
				{ kind: 'rank', value: 'CPT' }
			]
		},
		payload: {
			appliesToRoles: [],
			appliesToMos: ['68W'],
			appliesToRanks: [],
			excludedRoles: ['NCO'],
			excludedMos: ['88M'],
			excludedRanks: ['CPT'],
			isOptional: false
		}
	},
	{
		label: 'optional',
		saved: { isOptional: true },
		draft: { mode: 'optional', only: [], except: [] },
		payload: {
			appliesToRoles: [],
			appliesToMos: [],
			appliesToRanks: [],
			excludedRoles: [],
			excludedMos: [],
			excludedRanks: [],
			isOptional: true
		}
	},
	{
		label: 'optional with stored lists',
		saved: {
			isOptional: true,
			appliesToRoles: ['Driver'],
			appliesToMos: ['68W'],
			appliesToRanks: ['SGT'],
			excludedRoles: ['NCO'],
			excludedMos: ['88M'],
			excludedRanks: ['CPT']
		},
		draft: {
			mode: 'optional',
			only: [
				{ kind: 'role', value: 'Driver' },
				{ kind: 'mos', value: '68W' },
				{ kind: 'rank', value: 'SGT' }
			],
			except: [
				{ kind: 'role', value: 'NCO' },
				{ kind: 'mos', value: '88M' },
				{ kind: 'rank', value: 'CPT' }
			]
		},
		payload: {
			appliesToRoles: ['Driver'],
			appliesToMos: ['68W'],
			appliesToRanks: ['SGT'],
			excludedRoles: ['NCO'],
			excludedMos: ['88M'],
			excludedRanks: ['CPT'],
			isOptional: true
		}
	}
];

describe('Training type drafts', () => {
	it('creates the current defaults as a payload for a new type', () => {
		const draft = newTrainingTypeDraft();
		draft.name = 'First Aid';
		expect(trainingTypeInputFromDraft(draft)).toEqual({
			name: 'First Aid',
			description: null,
			color: '#6b7280',
			canBeExempted: false,
			sortOrder: 0,
			exemptPersonnelIds: [],
			expirationMonths: 12,
			expirationDateOnly: false,
			warningDaysYellow: 60,
			warningDaysOrange: 30,
			appliesToRoles: [],
			appliesToMos: [],
			appliesToRanks: [],
			excludedRoles: [],
			excludedMos: [],
			excludedRanks: [],
			isOptional: false
		});
	});

	describe.each(renewalCases)('$label renewal', (renewal) => {
		it.each(applicabilityCases)('round-trips $label without changing saved fields', (applicability) => {
			const draft = trainingTypeDraftFrom(savedType({ ...renewal.saved, ...applicability.saved }));
			expect(draft.renewal).toEqual(renewal.draft);
			expect(draft.applicability).toEqual(applicability.draft);
			expect(trainingTypeInputFromDraft(draft)).toEqual({
				name: 'CLS',
				description: '  Sustainment training  ',
				color: '#123456',
				canBeExempted: true,
				sortOrder: 7,
				exemptPersonnelIds: ['exempt-person'],
				...renewal.payload,
				...applicability.payload
			});
		});
	});

	it.each([null, ''])('retains the saved description %j', (description) => {
		expect(trainingTypeInputFromDraft(trainingTypeDraftFrom(savedType({ description })))).toMatchObject({
			name: 'CLS',
			description
		});
	});

	it('maps edited renewal and mixed chips without mutating the saved type', () => {
		const type = savedType({ appliesToRoles: ['Driver'] });
		const draft = trainingTypeDraftFrom(type);
		draft.renewal = { kind: 'cardDate', firstWarningDays: 80, finalWarningDays: 10 };
		draft.applicability.only = [
			{ kind: 'rank', value: 'SPC' },
			{ kind: 'mos', value: '68V' },
			{ kind: 'role', value: 'Therapist' },
			{ kind: 'mos', value: '68W' }
		];
		draft.applicability.except.push({ kind: 'rank', value: 'CPT' });
		draft.exemptPersonnelIds.push('another-person');
		expect(trainingTypeInputFromDraft(draft)).toMatchObject({
			expirationMonths: 12,
			expirationDateOnly: true,
			warningDaysYellow: 80,
			warningDaysOrange: 10,
			appliesToRoles: ['Therapist'],
			appliesToMos: ['68V', '68W'],
			appliesToRanks: ['SPC'],
			excludedRanks: ['CPT'],
			exemptPersonnelIds: ['exempt-person', 'another-person']
		});
		expect(type).toMatchObject({
			expirationDateOnly: false,
			warningDaysYellow: 45,
			warningDaysOrange: 15,
			appliesToRoles: ['Driver'],
			excludedRanks: [],
			exemptPersonnelIds: ['exempt-person']
		});
		draft.applicability.mode = 'everyone';
		draft.renewal = { kind: 'never' };
		expect(trainingTypeInputFromDraft(draft)).toMatchObject({
			expirationMonths: null,
			expirationDateOnly: false,
			warningDaysYellow: 45,
			warningDaysOrange: 15,
			appliesToRoles: [],
			appliesToMos: [],
			appliesToRanks: [],
			excludedRanks: ['CPT'],
			isOptional: false
		});
	});
});

describe('Training type draft validation', () => {
	it.each(['', '  '])('requires a name for %j', (name) => {
		expect(validateTrainingTypeDraft({ ...newTrainingTypeDraft(), name })).toEqual({ name: 'Give the type a name.' });
	});

	it('accepts a 100-character name and rejects a longer name', () => {
		expect(validateTrainingTypeDraft({ ...newTrainingTypeDraft(), name: 'a'.repeat(100) })).toEqual({});
		expect(Object.keys(validateTrainingTypeDraft({ ...newTrainingTypeDraft(), name: 'a'.repeat(101) }))).toEqual([
			'name'
		]);
	});

	it.each([0, 121, 1.5, NaN, Infinity])('rejects the month interval %s', (months) => {
		expect(
			Object.keys(
				validateTrainingTypeDraft({
					...newTrainingTypeDraft(),
					name: 'CLS',
					renewal: { kind: 'months', months, firstWarningDays: 60, finalWarningDays: 30 }
				})
			)
		).toEqual(['months']);
	});

	it.each([1, 120])('accepts the month interval boundary %s', (months) => {
		expect(
			validateTrainingTypeDraft({
				...newTrainingTypeDraft(),
				name: 'CLS',
				renewal: { kind: 'months', months, firstWarningDays: 60, finalWarningDays: 30 }
			})
		).toEqual({});
	});

	it.each<RenewalDraft>([
		{ kind: 'months', months: 12, firstWarningDays: 30, finalWarningDays: 30 },
		{ kind: 'cardDate', firstWarningDays: 30, finalWarningDays: 40 },
		{ kind: 'cardDate', firstWarningDays: 30, finalWarningDays: NaN }
	])('rejects an invalid final warning for $kind', (renewal) => {
		expect(Object.keys(validateTrainingTypeDraft({ ...newTrainingTypeDraft(), name: 'CLS', renewal }))).toEqual([
			'finalWarningDays'
		]);
	});

	it('reports a noninteger first warning and accepts a strictly shorter final warning', () => {
		expect(
			Object.keys(
				validateTrainingTypeDraft({
					...newTrainingTypeDraft(),
					name: 'CLS',
					renewal: { kind: 'cardDate', firstWarningDays: 10.5, finalWarningDays: 5 }
				})
			)
		).toEqual(['firstWarningDays']);
		expect(
			validateTrainingTypeDraft({
				...newTrainingTypeDraft(),
				name: 'CLS',
				renewal: { kind: 'cardDate', firstWarningDays: 1, finalWarningDays: 0 }
			})
		).toEqual({});
	});

	it('ignores hidden warnings and months for never-expiring types', () => {
		expect(
			validateTrainingTypeDraft(
				trainingTypeDraftFrom(
					savedType({
						expirationMonths: null,
						warningDaysYellow: 10,
						warningDaysOrange: 20
					})
				)
			)
		).toEqual({});
	});
});

const personnel: Personnel[] = [
	{
		id: 'driver',
		firstName: 'Amy',
		lastName: 'Able',
		rank: 'SPC',
		mos: '88M',
		clinicRole: 'Driver',
		groupId: null,
		groupName: 'Unassigned'
	},
	{
		id: 'medic',
		firstName: 'Bo',
		lastName: 'Baker',
		rank: ' SGT ',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: null,
		groupName: 'Unassigned'
	},
	{
		id: 'officer',
		firstName: 'Cam',
		lastName: 'Cole',
		rank: 'CPT',
		mos: '65D',
		clinicRole: 'PA',
		groupId: null,
		groupName: 'Unassigned'
	},
	{
		id: 'other',
		firstName: 'Dee',
		lastName: 'Dover',
		rank: 'PFC',
		mos: '42A',
		clinicRole: 'Clerk',
		groupId: null,
		groupName: 'Unassigned'
	}
];

describe('Applicability draft matches', () => {
	it.each<{ label: string; draft: ApplicabilityDraft; matched: string[]; removed: string[] }>([
		{
			label: 'everyone',
			draft: { mode: 'everyone', only: [], except: [] },
			matched: ['driver', 'medic', 'officer', 'other'],
			removed: []
		},
		{
			label: 'everyone except ranks',
			draft: { mode: 'everyone', only: [], except: [{ kind: 'rank', value: 'SGT' }] },
			matched: ['driver', 'officer', 'other'],
			removed: ['medic']
		},
		{
			label: 'OR across kinds with overlapping exceptions',
			draft: {
				mode: 'onlySome',
				only: [
					{ kind: 'role', value: 'Driver' },
					{ kind: 'mos', value: '68W' },
					{ kind: 'rank', value: 'CPT' }
				],
				except: [
					{ kind: 'role', value: 'Medic' },
					{ kind: 'rank', value: 'SGT' },
					{ kind: 'mos', value: '42A' }
				]
			},
			matched: ['driver', 'officer'],
			removed: ['medic']
		},
		{
			label: 'empty only list follows the existing rule',
			draft: { mode: 'onlySome', only: [], except: [] },
			matched: ['driver', 'medic', 'officer', 'other'],
			removed: []
		},
		{
			label: 'optional ignores stored lists',
			draft: {
				mode: 'optional',
				only: [{ kind: 'role', value: 'Driver' }],
				except: [{ kind: 'role', value: 'Driver' }]
			},
			matched: [],
			removed: []
		}
	])('shows the right names for $label', ({ draft, matched, removed }) => {
		const result = applicabilityMatches(draft, personnel);
		expect(result.matched.map((person) => person.id)).toEqual(matched);
		expect(result.removedByExcept.map((person) => person.id)).toEqual(removed);
	});
});
