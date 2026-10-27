import { expect, it } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

const ORG = 'test-org';
const person = (id: string, organization_id: string, archived_at: string | null) => ({
	id,
	organization_id,
	first_name: 'Pat',
	last_name: id,
	rank: 'SGT',
	mos: '68W',
	clinic_role: 'Medic',
	group_id: null,
	archived_at
});

function seeded(training: 'configure' | 'view') {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training,
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			}
		}
	});
	ctx.store.seed('personnel', [
		person('active', ORG, null),
		person('archived', ORG, '2026-01-01'),
		person('foreign', 'another-org', null)
	]);
	ctx.store.seed('organization_rank_catalog', [
		{
			id: 'rank-ssg',
			organization_id: ORG,
			code: 'SSG',
			label: 'Staff Sergeant',
			service: 'army',
			category: 'enlisted',
			pay_grade: 'E-6',
			state: 'active',
			source: 'custom',
			sort_order: 0
		}
	]);
	ctx.store.seed('training_types', [
		{ id: 'own-type', organization_id: ORG, name: 'SHARP', expiration_months: 12, sort_order: 0 },
		{ id: 'foreign-type', organization_id: 'another-org', name: 'Foreign', sort_order: 0 }
	]);
	return ctx;
}

it('gives a Training configurer the requested Organization types, active personnel and ranks', async () => {
	const ctx = seeded('configure');
	const editor = await handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx);
	expect(editor.trainingTypes.map(({ id, name, expirationMonths }) => ({ id, name, expirationMonths }))).toEqual([
		{ id: 'own-type', name: 'SHARP', expirationMonths: 12 }
	]);
	expect(editor.personnel.map(({ id }) => id)).toEqual(['active']);
	expect(editor.rankCatalog.map(({ code }) => code)).toEqual(['SSG']);
});

it('refuses a Training viewer', async () => {
	const ctx = seeded('view');
	await expect(handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx)).rejects.toMatchObject({ status: 403 });
});
