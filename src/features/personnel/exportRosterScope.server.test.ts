import { expect, it } from 'vitest';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { personnelProvider } from './test-support/personnelProvider';
import { createSupabasePersonnelCalendarRosterPort } from './calendarRoster.server';
import { createSupabasePersonnelTrainingRosterPort } from './trainingRoster.server';
import { createSupabasePersonnelCriticalTasksRosterPort } from './criticalTasksRoster.server';

it('keeps all export roster lanes inside the SQL-provided subtree coverage', async () => {
	const actor = createTestAuthContext({
		orgId: 'org-a',
		role: 'member',
		isPrivileged: false,
		scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['squad', 'alpha'] }),
		capabilityMap: {
			personnel: 'none',
			calendar: 'view',
			training: 'view',
			criticalTasks: 'view',
			onboarding: 'none',
			ratingScheme: 'none'
		}
	});
	const person = (id: string, groupId: string | null, orgId = 'org-a', archivedAt: string | null = null) => ({
		id,
		organization_id: orgId,
		group_id: groupId,
		archived_at: archivedAt,
		rank: 'SPC',
		first_name: 'Pat',
		last_name: id,
		mos: '68W',
		clinic_role: '',
		groups: { name: groupId }
	});
	const { client } = personnelProvider({
		personnel: [
			person('hq', 'squad'),
			person('team', 'alpha'),
			person('outside', 'bravo'),
			person('unassigned', null),
			person('foreign', 'alpha', 'org-b'),
			person('archived', 'alpha', 'org-a', '2026-10-01')
		]
	});
	const calendar = await createSupabasePersonnelCalendarRosterPort(() => client).listActive(actor);
	const training = await createSupabasePersonnelTrainingRosterPort(() => client).listActiveForReports(actor);
	const criticalTasks = await createSupabasePersonnelCriticalTasksRosterPort(() => client).listActiveForReadiness(
		actor
	);
	expect(calendar.map((person) => person.id)).toEqual(['hq', 'team']);
	expect(training.map((person) => person.id)).toEqual(['hq', 'team']);
	expect(criticalTasks.map((person) => person.id)).toEqual(['hq', 'team']);
});
