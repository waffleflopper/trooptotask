import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _putConfig } from './+server';

const PERSON = '00000000-0000-4000-8000-000000006001';
const SECOND_PERSON = '00000000-0000-4000-8000-000000006002';
const EXEMPTIBLE_TYPE = '00000000-0000-4000-8000-000000006003';
const REQUIRED_TYPE = '00000000-0000-4000-8000-000000006004';

function seededContext(auth?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(auth);
	const orgId = ctx.auth.orgId;
	ctx.store.seed('personnel', [
		{ id: PERSON, organization_id: orgId, group_id: null },
		{ id: SECOND_PERSON, organization_id: orgId, group_id: null }
	]);
	ctx.store.seed('training_types', [
		{ id: EXEMPTIBLE_TYPE, organization_id: orgId, can_be_exempted: true, exempt_personnel_ids: [SECOND_PERSON] },
		{ id: REQUIRED_TYPE, organization_id: orgId, can_be_exempted: false, exempt_personnel_ids: [] }
	]);
	const put = (typeId: string, personnelId: string, exempt: unknown) =>
		handleUseCaseRequest(_putConfig, ctx, { typeId, personnelId, exempt }, () => ctx);
	const exemptIds = async (typeId: string) =>
		(await ctx.store.findOne<{ exempt_personnel_ids: string[] }>('training_types', orgId, { id: typeId }))
			?.exempt_personnel_ids;
	return { ctx, put, exemptIds };
}

describe('PUT /api/training-types/[typeId]/exemptions/[personnelId]', () => {
	it('adds and removes one Person, and repeating either changes nothing', async () => {
		const { put, exemptIds } = seededContext();

		expect(await put(EXEMPTIBLE_TYPE, PERSON, true)).toEqual({ exempt: true });
		expect(await put(EXEMPTIBLE_TYPE, PERSON, true)).toEqual({ exempt: true });
		expect(await exemptIds(EXEMPTIBLE_TYPE)).toEqual([SECOND_PERSON, PERSON]);

		expect(await put(EXEMPTIBLE_TYPE, SECOND_PERSON, false)).toEqual({ exempt: false });
		expect(await put(EXEMPTIBLE_TYPE, SECOND_PERSON, false)).toEqual({ exempt: false });
		expect(await exemptIds(EXEMPTIBLE_TYPE)).toEqual([PERSON]);
	});

	it('answers 409 when the type does not allow exemptions', async () => {
		const { put, exemptIds } = seededContext();

		await expect(put(REQUIRED_TYPE, PERSON, true)).rejects.toMatchObject({
			status: 409,
			message: 'This Training type does not allow exemptions'
		});
		expect(await exemptIds(REQUIRED_TYPE)).toEqual([]);
	});

	it.each([
		['an unknown type', '00000000-0000-4000-8000-000000006999', PERSON, 'This Training type is no longer available'],
		['an unknown Person', EXEMPTIBLE_TYPE, '00000000-0000-4000-8000-000000006998', 'Personnel not found']
	])('answers 404 for %s', async (_label, typeId, personnelId, message) => {
		const { put } = seededContext();

		await expect(put(typeId, personnelId, true)).rejects.toMatchObject({ status: 404, message });
	});

	it.each([
		['a missing choice', EXEMPTIBLE_TYPE, undefined, 'Choose whether the Person is exempt'],
		['a malformed type id', 'not-a-type', true, 'Invalid ID']
	])('answers 400 for %s', async (_label, typeId, exempt, message) => {
		const { put } = seededContext();

		await expect(put(typeId, PERSON, exempt)).rejects.toMatchObject({ status: 400, body: { message } });
	});

	it('refuses a Training operator and leaves the exemptions unchanged', async () => {
		const { put, exemptIds } = seededContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});

		await expect(put(EXEMPTIBLE_TYPE, PERSON, true)).rejects.toMatchObject({ status: 403 });
		expect(await exemptIds(EXEMPTIBLE_TYPE)).toEqual([SECOND_PERSON]);
	});
});
