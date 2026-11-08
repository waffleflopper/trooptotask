import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

const USED = '00000000-0000-4000-8000-000000000021';
const UNUSED = '00000000-0000-4000-8000-000000000022';

function context(options?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(options);
	const status = (id: string, name: string, orgId: string) => ({
		id,
		organization_id: orgId,
		name,
		color: '#22c55e',
		text_color: '#ffffff',
		sort_order: 0
	});
	ctx.store.seed('status_types', [status(USED, 'Leave', ctx.auth.orgId), status(UNUSED, 'Sick', ctx.auth.orgId)]);
	ctx.store.seed('availability_entries', [
		{ id: 'e-1', organization_id: ctx.auth.orgId, status_type_id: USED, personnel_id: 'p-1' },
		{ id: 'e-2', organization_id: ctx.auth.orgId, status_type_id: USED, personnel_id: 'p-2' },
		{ id: 'e-3', organization_id: 'another-org', status_type_id: UNUSED, personnel_id: 'p-9' }
	]);
	return ctx;
}

const get = (ctx: ReturnType<typeof context>) => handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx);

describe('GET status type usage', () => {
	it('counts this Organization entries per status and lists unused statuses as zero', async () => {
		expect(await get(context())).toEqual({ [USED]: 2, [UNUSED]: 0 });
	});

	it('denies a member without Calendar configure', async () => {
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

		await expect(get(ctx)).rejects.toMatchObject({ status: 403 });
	});
});
