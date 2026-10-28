import { describe, expect, it } from 'vitest';
import { createWritePortsContext } from '$features/calendar/calendarPersistence.test-support.server';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const apply = (ctx: ReturnType<typeof createWritePortsContext>, input: unknown) =>
	handleUseCaseRequest(_postConfig, ctx, input, () => ctx);

describe('Calendar suggestions endpoint', () => {
	it('returns the created presets and reloaded settings catalogs', async () => {
		const ctx = createWritePortsContext();
		const result = await apply(ctx, { statusIds: ['leave'], assignmentIds: ['staff-duty'] });
		expect(result.created.map(({ id }) => id)).toEqual(['leave', 'staff-duty']);
		expect(result.statusTypes).toMatchObject([{ name: 'Leave', color: '#48bb78', textColor: '#ffffff' }]);
		expect(result.assignmentTypes).toMatchObject([{ name: 'Staff Duty', shortName: 'SD', assignTo: 'personnel' }]);
		expect(result.failed).toEqual([]);
	});

	it.each([
		{ statusIds: ['leave', 'leave'], assignmentIds: [] },
		{ statusIds: [], assignmentIds: ['unknown'] }
	])('rejects invalid picks without saving any rows', async (input) => {
		const ctx = createWritePortsContext();
		await expect(apply(ctx, input)).rejects.toMatchObject({ status: 400 });
		expect(await ctx.calendarCatalogs.listStatusTypes()).toEqual([]);
		expect(await ctx.calendarCatalogs.listAssignmentTypes()).toEqual([]);
	});

	it('denies a member without Calendar configure access before writing either catalog', async () => {
		const ctx = createWritePortsContext({ auth: { role: 'member', capabilityMap: createCapabilityMap('view') } });
		await expect(apply(ctx, { statusIds: ['leave'], assignmentIds: ['staff-duty'] })).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.calendarCatalogs.listStatusTypes()).toEqual([]);
		expect(await ctx.calendarCatalogs.listAssignmentTypes()).toEqual([]);
		expect(ctx.audit.events).toMatchObject([{ action: 'policy.denied' }]);
	});
});
