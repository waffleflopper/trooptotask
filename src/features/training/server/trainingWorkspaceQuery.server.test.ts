import { describe, expect, it } from 'vitest';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { createQueryWithRawStorePortsContext } from './trainingPersistence.test-support.server';
import { fetchTrainingWorkspaceData } from './trainingWorkspaceQuery.server';
import { fetchTrainingBriefingReport } from './trainingReportsQuery.server';
import { DEFAULT_TRAINING_BRIEFING_INPUT } from '../contracts';
import { summarizeTrainingReadiness } from '../utils/trainingBriefing';
import type { TrainingTypeRow } from './trainingPersistenceMapping.server';

const ORG = 'test-org';

async function loadGroupChoices(scopeSet: ScopeSet) {
	const ctx = createQueryWithRawStorePortsContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet,
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training: 'view',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
	ctx.rawStore.seed('groups', [
		{ id: 'alpha', organization_id: ORG, name: 'Alpha', sort_order: 0 },
		{ id: 'bravo', organization_id: ORG, name: 'Bravo', sort_order: 1 }
	]);
	ctx.rawStore.seed('user_pinned_groups', [
		{ id: 'pin-bravo', organization_id: ORG, user_id: 'test-user', group_name: 'Bravo', sort_order: 0 },
		{ id: 'pin-alpha', organization_id: ORG, user_id: 'test-user', group_name: 'Alpha', sort_order: 1 }
	]);
	const workspace = fetchTrainingWorkspaceData(ctx, ORG);
	await Promise.allSettled(Object.values(workspace));
	return { groups: await workspace.groups, pinnedGroups: await workspace.pinnedGroups };
}

describe('fetchTrainingWorkspaceData', () => {
	it('matches the all-types Organization report for the same active personnel, day and goal', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		ctx.rawStore.seed('organizations', [{ id: ORG, name: 'Test Company', training_readiness_goal_percent: 80 }]);
		ctx.rawStore.seed('personnel', [
			{
				id: 'able',
				organization_id: ORG,
				first_name: 'Pat',
				last_name: 'Able',
				rank: 'SGT',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'alpha',
				archived_at: null
			},
			{
				id: 'baker',
				organization_id: ORG,
				first_name: 'Pat',
				last_name: 'Baker',
				rank: 'SPC',
				mos: '11B',
				clinic_role: 'Line',
				group_id: 'bravo',
				archived_at: null
			},
			{
				id: 'cole',
				organization_id: ORG,
				first_name: 'Pat',
				last_name: 'Cole',
				rank: 'SPC',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'alpha',
				archived_at: null
			},
			{
				id: 'archived',
				organization_id: ORG,
				first_name: 'Pat',
				last_name: 'Archived',
				rank: 'SGT',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'alpha',
				archived_at: '2026-01-01'
			}
		]);
		const type = (id: string, overrides: Partial<TrainingTypeRow> = {}): TrainingTypeRow => ({
			id,
			organization_id: ORG,
			name: id,
			description: null,
			expiration_months: 12,
			warning_days_yellow: 60,
			warning_days_orange: 30,
			applies_to_roles: [],
			applies_to_mos: [],
			applies_to_ranks: [],
			excluded_roles: [],
			excluded_mos: [],
			excluded_ranks: [],
			can_be_exempted: false,
			exempt_personnel_ids: [],
			is_optional: false,
			expiration_date_only: false,
			color: '#000000',
			sort_order: 0,
			...overrides
		});
		ctx.rawStore.seed('training_types', [
			type('annual'),
			type('card', { expiration_date_only: true, expiration_months: null }),
			type('optional', { is_optional: true })
		]);
		const completion = (personnelId: string, typeId: string, expirationDate: string) => ({
			id: `${personnelId}-${typeId}`,
			organization_id: ORG,
			personnel_id: personnelId,
			training_type_id: typeId,
			completion_date: typeId === 'card' ? null : '2026-01-01',
			expiration_date: expirationDate,
			notes: null,
			certificate_url: null
		});
		ctx.rawStore.seed('personnel_trainings', [
			completion('able', 'annual', '2026-10-10'),
			completion('baker', 'annual', '2026-09-28'),
			completion('able', 'card', '2030-01-01'),
			completion('baker', 'card', '2030-01-01'),
			completion('able', 'optional', '2025-01-01'),
			completion('archived', 'annual', '2030-01-01')
		]);
		const workspace = fetchTrainingWorkspaceData(ctx, ORG);
		const [personnel, types, records, report] = await Promise.all([
			workspace.personnel,
			workspace.trainingTypes,
			workspace.personnelTrainings,
			fetchTrainingBriefingReport(ctx, { ...DEFAULT_TRAINING_BRIEFING_INPUT, horizonDays: 30 }, '2026-09-29')
		]);
		await Promise.all(Object.values(workspace));
		const summary = summarizeTrainingReadiness({
			personnel,
			types,
			records,
			asOf: '2026-09-29',
			horizonDays: 30,
			goalPercent: 80
		});
		expect(personnel.map((person) => person.id).sort()).toEqual(['able', 'baker', 'cole']);
		expect(summary).toEqual({
			asOf: '2026-09-29',
			horizonEnd: '2026-10-29',
			horizonEndLabel: '29 Oct',
			goalPercent: 80,
			today: { ready: 3, applicable: 6, percent: 50, band: 'far' },
			horizon: { ready: 2, applicable: 6, percent: 33, band: 'critical' },
			expired: 1,
			notRecorded: 2,
			lapsing: 1
		});
		expect(report.briefing.bottomLine).toMatchObject({
			soldierCount: 3,
			asOf: summary.asOf,
			horizonEnd: summary.horizonEnd,
			horizonEndLabel: summary.horizonEndLabel,
			today: summary.today,
			horizon: summary.horizon,
			expired: summary.expired,
			notRecorded: summary.notRecorded,
			lapsing: summary.lapsing
		});
	});

	it('returns only the Groups and pinned names in a Group-scoped viewer’s scope', async () => {
		await expect(loadGroupChoices({ kind: 'groups', groupIds: ['alpha'] })).resolves.toEqual({
			groups: [{ id: 'alpha', name: 'Alpha', sortOrder: 0 }],
			pinnedGroups: ['Alpha']
		});
	});

	it('returns no Groups or pinned names to an empty Group scope', async () => {
		await expect(loadGroupChoices({ kind: 'groups', groupIds: [] })).resolves.toEqual({
			groups: [],
			pinnedGroups: []
		});
	});

	it('keeps the full catalog and pins for an Organization-scoped Training-only viewer', async () => {
		const { groups, pinnedGroups } = await loadGroupChoices({ kind: 'organization' });

		expect(groups.map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
		expect(pinnedGroups).toEqual(['Bravo', 'Alpha']);
	});
});
