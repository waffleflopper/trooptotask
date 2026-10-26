import { describe, expect, it } from 'vitest';
import { summarizeApplicability } from './trainingApplicabilitySummary';
import type { ApplicabilityDraft } from './trainingTypeDraft';

const draft = (fields: Partial<ApplicabilityDraft>): ApplicabilityDraft => ({
	mode: 'everyone',
	only: [],
	except: [],
	...fields
});

describe('summarizeApplicability', () => {
	it.each<[string, ApplicabilityDraft, string]>([
		['everyone', draft({}), 'Everyone'],
		[
			'optional, ignoring any chips',
			draft({ mode: 'optional', only: [{ kind: 'role', value: 'Driver' }] }),
			'Optional'
		],
		['one role', draft({ mode: 'onlySome', only: [{ kind: 'role', value: 'Driver' }] }), 'Role: Driver'],
		[
			'values of one kind grouped, kinds in role, MOS, rank order',
			draft({
				mode: 'onlySome',
				only: [
					{ kind: 'rank', value: 'SGT' },
					{ kind: 'mos', value: '88M' },
					{ kind: 'role', value: 'Driver' },
					{ kind: 'role', value: 'Medic' }
				]
			}),
			'Role: Driver, Medic; MOS: 88M; Rank: SGT'
		],
		['an exception to everyone', draft({ except: [{ kind: 'mos', value: '68W' }] }), 'Everyone except MOS 68W'],
		[
			'an exception to a narrowed audience',
			draft({
				mode: 'onlySome',
				only: [{ kind: 'role', value: 'Driver' }],
				except: [{ kind: 'rank', value: 'PVT' }]
			}),
			'Role: Driver except Rank PVT'
		],
		['only some with no chips yet', draft({ mode: 'onlySome' }), 'Everyone']
	])('describes %s', (_label, applicability, expected) => {
		expect(summarizeApplicability(applicability)).toBe(expected);
	});
});
