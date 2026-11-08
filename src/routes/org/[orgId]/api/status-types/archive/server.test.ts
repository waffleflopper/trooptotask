import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _putConfig } from './+server';

const LEAVE = '00000000-0000-4000-8000-000000000011';
const FOREIGN = '00000000-0000-4000-8000-000000000099';

function context(options?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(options);
	ctx.store.seed('status_types', [
		{
			id: LEAVE,
			organization_id: ctx.auth.orgId,
			name: 'Leave',
			color: '#22c55e',
			text_color: '#ffffff',
			sort_order: 0,
			archived_at: null
		}
	]);
	ctx.store.seed('availability_entries', [
		{ id: 'entry-1', organization_id: ctx.auth.orgId, status_type_id: LEAVE, personnel_id: 'p-1' }
	]);
	return ctx;
}

const put = (ctx: ReturnType<typeof context>, input: Record<string, unknown>) =>
	handleUseCaseRequest(_putConfig, ctx, input, () => ctx);

describe('PUT status type archive', () => {
	it('archives a status with entries, answers the time the server set, and keeps the entries', async () => {
		const ctx = context();

		const result = (await put(ctx, { id: LEAVE, archived: true })) as { archivedAt: string };

		expect(result.archivedAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
		expect(await ctx.store.findOne('status_types', ctx.auth.orgId, { id: LEAVE })).toMatchObject({
			archived_at: result.archivedAt
		});
		expect(await ctx.store.findMany('availability_entries', ctx.auth.orgId)).toHaveLength(1);
	});

	it('restores it', async () => {
		const ctx = context();
		await put(ctx, { id: LEAVE, archived: true });

		expect(await put(ctx, { id: LEAVE, archived: false })).toMatchObject({ id: LEAVE, archivedAt: null });
	});

	it('refuses an archive time sent by the client', async () => {
		const ctx = context();

		await expect(put(ctx, { id: LEAVE, archived: true, archivedAt: '1999-01-01T00:00:00Z' })).rejects.toMatchObject({
			status: 400
		});
		expect(await ctx.store.findOne('status_types', ctx.auth.orgId, { id: LEAVE })).toMatchObject({
			archived_at: null
		});
	});

	it('answers 404 for a status type in another Organization and leaves it alone', async () => {
		const ctx = context();
		ctx.store.seed('status_types', [
			{
				id: FOREIGN,
				organization_id: 'another-org',
				name: 'Foreign',
				color: '#22c55e',
				text_color: '#ffffff',
				sort_order: 0,
				archived_at: null
			}
		]);

		await expect(put(ctx, { id: FOREIGN, archived: true })).rejects.toMatchObject({ status: 404 });
		expect(await ctx.store.findOne('status_types', 'another-org', { id: FOREIGN })).toMatchObject({
			archived_at: null
		});
	});

	it('denies a member without Calendar configure and archives nothing', async () => {
		const ctx = context({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'organization' },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});

		await expect(put(ctx, { id: LEAVE, archived: true })).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findOne('status_types', ctx.auth.orgId, { id: LEAVE })).toMatchObject({
			archived_at: null
		});
	});
});
