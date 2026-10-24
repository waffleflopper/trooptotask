import { describe, expect, it } from 'vitest';
import { createSupabaseTrainingCompletionPersistence } from './trainingCompletionPersistence.server';
import { trainingProvider } from './test-support/trainingProvider.server';

const ORG = 'org-a';

function row(id: string, person = 'person-a', type = 'type-a') {
	return {
		id,
		organization_id: ORG,
		personnel_id: person,
		training_type_id: type,
		completion_date: '2026-06-01',
		expiration_date: '2027-06-01',
		notes: 'Keep this editor note',
		certificate_url: 'certificates/synthetic.pdf',
		created_at: '2026-06-01T00:00:00Z',
		updated_at: '2026-06-02T00:00:00Z'
	};
}

function ports(rows: ReturnType<typeof row>[]) {
	const provider = trainingProvider({ personnel_trainings: rows });
	return { ...provider, completions: createSupabaseTrainingCompletionPersistence(provider.client, ORG) };
}

describe('Training completion bulk reads', () => {
	it('returns every matrix record in ID order while at most four remaining pages are outstanding', async () => {
		const ids = Array.from({ length: 6001 }, (_, index) => `r-${String(index).padStart(4, '0')}`);
		const { completions, state } = ports(ids.toReversed().map((id) => row(id)));
		state.unstablePages = true;
		const blocked = Promise.withResolvers<void>();
		const fourStarted = Promise.withResolvers<void>();
		let outstanding = 0;
		state.beforeRead = async ({ offset }) => {
			if (offset === 0) return;
			outstanding++;
			if (outstanding === 4) fourStarted.resolve();
			await blocked.promise;
			outstanding--;
		};
		const pending = completions.listCompletions();
		await fourStarted.promise;
		expect(outstanding).toBe(4);
		expect(state.requests.filter(({ offset }) => offset > 0)).toHaveLength(4);
		blocked.resolve();
		const records = await pending;

		expect(records.map((record) => record.id)).toEqual(ids);
		expect(records[0]).toEqual({
			id: 'r-0000',
			personnelId: 'person-a',
			trainingTypeId: 'type-a',
			completionDate: '2026-06-01',
			expirationDate: '2027-06-01',
			notes: 'Keep this editor note',
			certificateUrl: 'certificates/synthetic.pdf'
		});
	});

	it('keeps all requested people and types across one-page partitions without duplicate records or editor data', async () => {
		const people = Array.from({ length: 52 }, (_, index) => `person-${String(index).padStart(2, '0')}`);
		const types = Array.from({ length: 52 }, (_, index) => `type-${String(index).padStart(2, '0')}`);
		const expected = people.flatMap((personnelId) =>
			types.map((trainingTypeId) => ({
				personnelId,
				trainingTypeId,
				completionDate: '2026-06-01',
				expirationDate: '2027-06-01'
			}))
		);
		const { completions, state } = ports([
			...people.flatMap((person) => types.map((type) => row(`${person}-${type}`, person, type))).toReversed(),
			row('excluded-person', 'outside', types[0]),
			row('excluded-type', people[0], 'outside'),
			{ ...row('foreign', people[0], types[0]), organization_id: 'org-b' }
		]);
		state.unstablePages = true;

		const facts = await completions.listReadinessCompletions({
			personnelIds: [...people, people[0]],
			trainingTypeIds: [...types, types[0]]
		});

		expect(facts).toHaveLength(expected.length);
		expect(facts).toEqual(expect.arrayContaining(expected));
		expect(state.requests.map(({ offset }) => offset)).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it('retains archived onboarding people and types outside the current catalog when no type filter is requested', async () => {
		const { completions } = ports([
			row('a-archived', 'archived-packet-person', 'old-type'),
			row('b-active', 'active-person', 'current-type'),
			row('c-unrequested', 'unrequested', 'old-type')
		]);

		expect(
			await completions.listReadinessCompletions({
				personnelIds: ['active-person', 'archived-packet-person']
			})
		).toEqual([
			{
				personnelId: 'archived-packet-person',
				trainingTypeId: 'old-type',
				completionDate: '2026-06-01',
				expirationDate: '2027-06-01'
			},
			{
				personnelId: 'active-person',
				trainingTypeId: 'current-type',
				completionDate: '2026-06-01',
				expirationDate: '2027-06-01'
			}
		]);
	});

	it('returns no facts for an empty population or requirement set and refuses a partial result after a later page fails', async () => {
		const { completions, state } = ports(
			Array.from({ length: 1001 }, (_, index) => row(`r-${String(index).padStart(4, '0')}`))
		);
		expect(await completions.listReadinessCompletions({ personnelIds: [] })).toEqual([]);
		expect(await completions.listReadinessCompletions({ personnelIds: ['person-a'], trainingTypeIds: [] })).toEqual([]);
		state.failure = ({ offset }) =>
			offset === 1000 ? { code: '42501', message: 'Training read denied', status: 403 } : null;
		await expect(completions.listReadinessCompletions({ personnelIds: ['person-a'] })).rejects.toThrow(
			'Training read denied'
		);
	});
});
