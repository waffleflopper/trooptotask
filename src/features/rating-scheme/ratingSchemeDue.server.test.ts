import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonnelRatingSchemeRosterPort } from '$features/personnel/contracts';
import type { RatingSchemeDueActor, RatingSchemeDueEntry } from './contracts';
import { createSupabaseRatingSchemeDuePort } from './ratingSchemeDue.server';

type ProviderRow = {
	id: string;
	organization_id: string;
	rated_person_id: string;
	eval_type: RatingSchemeDueEntry['evalType'];
	rating_period_end: string;
	status: RatingSchemeDueEntry['status'];
} & Record<string, unknown>;

function actor(overrides: Partial<RatingSchemeDueActor> = {}): RatingSchemeDueActor {
	return {
		userId: 'user-a',
		orgId: 'org-a',
		role: 'member',
		isPrivileged: false,
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'view'
		},
		scopeSet: { kind: 'groups', groupIds: ['alpha'] },
		...overrides
	};
}

function provider(rows: ProviderRow[] = [], failFrom?: number, archivedIds: string[] = []) {
	const selections: string[] = [];
	const from = vi.fn((table: string) => {
		if (table !== 'rating_scheme_entries') throw new Error('This projection cannot read another table');
		let visible = [...rows];
		const query = {
			select: (columns: string) => {
				selections.push(columns);
				return query;
			},
			eq: (column: string, value: unknown) => {
				visible = visible.filter((row) => row[column] === value);
				return query;
			},
			order: (column: string, { ascending }: { ascending: boolean }) => {
				visible.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
				return query;
			},
			range: async (start: number, end: number) => {
				if (start === failFrom) return { data: null, error: { message: 'Due projection unavailable' } };
				return { data: visible.slice(start, end + 1), error: null };
			}
		};
		return query;
	});
	const listArchivedRatedPersonIds = vi
		.fn<PersonnelRatingSchemeRosterPort['listArchivedRatedPersonIds']>()
		.mockResolvedValue(archivedIds);
	return {
		from,
		selections,
		listArchivedRatedPersonIds,
		port: createSupabaseRatingSchemeDuePort({ from } as unknown as SupabaseClient, { listArchivedRatedPersonIds })
	};
}

function pageRows(): ProviderRow[] {
	return [
		...Array.from({ length: 1000 }, (_, index) => ({
			id: `evaluation-${String(index).padStart(4, '0')}`,
			organization_id: 'org-a',
			rated_person_id: 'person-a',
			eval_type: 'NCOER' as const,
			rating_period_end: '2026-01-01',
			status: 'active' as const
		})),
		{
			id: 'evaluation-1000',
			organization_id: 'org-a',
			rated_person_id: 'person-a',
			eval_type: 'NCOER' as const,
			rating_period_end: '2030-12-31',
			status: 'completed' as const
		}
	].reverse();
}

describe('Rating Scheme due projection', () => {
	it('reads the due facts and entry identity for the requested Organization, without evaluators or notes', async () => {
		const { port, selections } = provider([
			{
				id: 'evaluation-1',
				organization_id: 'org-a',
				rating_period_end: '2026-09-25',
				status: 'active',
				rated_person_id: 'person-a',
				eval_type: 'NCOER',
				rater_name: 'Private evaluator name',
				notes: 'Private evaluation notes'
			},
			{
				id: 'evaluation-2',
				organization_id: 'org-a',
				rated_person_id: 'person-b',
				eval_type: 'OER',
				rating_period_end: '2026-10-10',
				status: 'change-of-rater'
			},
			{
				id: 'evaluation-3',
				organization_id: 'org-a',
				rated_person_id: 'person-c',
				eval_type: 'NCOER',
				rating_period_end: '2026-01-01',
				status: 'completed'
			},
			{
				id: 'foreign-evaluation',
				organization_id: 'org-b',
				rated_person_id: 'person-d',
				eval_type: 'NCOER',
				rating_period_end: '2026-08-01',
				status: 'active'
			}
		]);

		await expect(port.listDueEntries(actor())).resolves.toEqual([
			{
				id: 'evaluation-1',
				ratedPersonId: 'person-a',
				evalType: 'NCOER',
				ratingPeriodEnd: '2026-09-25',
				status: 'active'
			},
			{
				id: 'evaluation-2',
				ratedPersonId: 'person-b',
				evalType: 'OER',
				ratingPeriodEnd: '2026-10-10',
				status: 'change-of-rater'
			},
			{
				id: 'evaluation-3',
				ratedPersonId: 'person-c',
				evalType: 'NCOER',
				ratingPeriodEnd: '2026-01-01',
				status: 'completed'
			}
		]);
		expect(selections).toHaveLength(1);
		expect(
			selections[0]
				.split(',')
				.map((column) => column.trim())
				.sort()
		).toEqual(['eval_type', 'id', 'rated_person_id', 'rating_period_end', 'status']);
	});

	it('omits evaluations of archived People, matching IDs case-insensitively', async () => {
		const { port, listArchivedRatedPersonIds } = provider(
			[
				{
					id: 'evaluation-active',
					organization_id: 'org-a',
					rated_person_id: 'person-active',
					eval_type: 'NCOER',
					rating_period_end: '2026-09-25',
					status: 'active'
				},
				{
					id: 'evaluation-archived',
					organization_id: 'org-a',
					rated_person_id: 'person-archived',
					eval_type: 'NCOER',
					rating_period_end: '2026-10-10',
					status: 'active'
				},
				{
					id: 'evaluation-archived-upper',
					organization_id: 'org-a',
					rated_person_id: 'PERSON-ARCHIVED-TWO',
					eval_type: 'NCOER',
					rating_period_end: '2026-10-11',
					status: 'change-of-rater'
				}
			],
			undefined,
			['PERSON-ARCHIVED', 'person-archived-two']
		);
		const reader = actor();
		await expect(port.listDueEntries(reader)).resolves.toEqual([
			{
				id: 'evaluation-active',
				ratedPersonId: 'person-active',
				evalType: 'NCOER',
				ratingPeriodEnd: '2026-09-25',
				status: 'active'
			}
		]);
		expect(listArchivedRatedPersonIds).toHaveBeenCalledWith(reader);
	});

	it('reads entries and archived IDs concurrently', async () => {
		const { port, from, listArchivedRatedPersonIds } = provider();
		let release!: () => void;
		const wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		listArchivedRatedPersonIds.mockImplementation(async () => {
			await wait;
			return [];
		});
		const pending = port.listDueEntries(actor());
		try {
			await vi.waitFor(() => {
				expect(from).toHaveBeenCalledTimes(1);
				expect(listArchivedRatedPersonIds).toHaveBeenCalledTimes(1);
			});
		} finally {
			release();
		}
		await expect(pending).resolves.toEqual([]);
	});

	it('rejects an archived-ID failure instead of counting archived evaluations', async () => {
		const { port, listArchivedRatedPersonIds } = provider();
		listArchivedRatedPersonIds.mockRejectedValue(new Error('Archived unavailable'));
		await expect(port.listDueEntries(actor())).rejects.toThrow('Archived unavailable');
	});

	it.each(['none', 'configure'] as const)(
		'skips the provider without Rating view even with Personnel %s',
		async (personnel) => {
			const { port, from, listArchivedRatedPersonIds } = provider();
			const reader = actor();
			await expect(
				port.listDueEntries({ ...reader, capabilityMap: { ...reader.capabilityMap, personnel, ratingScheme: 'none' } })
			).resolves.toEqual([]);
			expect(from).not.toHaveBeenCalled();
			expect(listArchivedRatedPersonIds).not.toHaveBeenCalled();
		}
	);

	it('skips the provider for an empty Group scope', async () => {
		const { port, from, listArchivedRatedPersonIds } = provider();
		await expect(port.listDueEntries(actor({ scopeSet: { kind: 'groups', groupIds: [] } }))).resolves.toEqual([]);
		expect(from).not.toHaveBeenCalled();
		expect(listArchivedRatedPersonIds).not.toHaveBeenCalled();
	});

	it.each(['owner', 'admin'] as const)('retains normalized %s access across the Organization', async (role) => {
		const { port } = provider([
			{
				id: 'evaluation-1',
				organization_id: 'org-a',
				rated_person_id: 'person-a',
				eval_type: 'NCOER',
				rating_period_end: '2026-10-20',
				status: 'active'
			}
		]);
		const reader = actor();
		await expect(
			port.listDueEntries({
				...reader,
				role,
				isPrivileged: true,
				scopeSet: { kind: 'organization' },
				capabilityMap: {
					calendar: 'configure',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			})
		).resolves.toEqual([
			{
				id: 'evaluation-1',
				ratedPersonId: 'person-a',
				evalType: 'NCOER',
				ratingPeriodEnd: '2026-10-20',
				status: 'active'
			}
		]);
	});

	it('includes evaluations beyond the first provider page in stable identity order', async () => {
		const { port } = provider(pageRows());
		const entries = await port.listDueEntries(actor());
		expect(entries).toHaveLength(1001);
		expect(entries[0]).toMatchObject({ id: 'evaluation-0000', ratingPeriodEnd: '2026-01-01', status: 'active' });
		expect(entries[1000]).toMatchObject({ id: 'evaluation-1000', ratingPeriodEnd: '2030-12-31', status: 'completed' });
	});

	it.each([0, 1000])(
		'rejects a provider failure at offset %i instead of returning an empty or partial projection',
		async (offset) => {
			const { port } = provider(pageRows(), offset);
			await expect(port.listDueEntries(actor())).rejects.toThrow('Due projection unavailable');
		}
	);
});
