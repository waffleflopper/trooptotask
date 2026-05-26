import { describe, it, expect } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';

// Import the route config (not the HTTP handler)
import { _putConfig } from './+server';

describe('PUT /api/duty-roster-exemptions', () => {
	it('exports a RouteConfig with correct permission and mutation', () => {
		expect('permission' in _putConfig).toBe(false);
		expect(_putConfig.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.configureDutyTemplates);
		expect(_putConfig.policyResource).toEqual({ kind: 'unscoped' });
		expect(_putConfig.mutation).toBe(true);
	});

	it('updates exempt personnel and returns the result', async () => {
		const ctx = createTestContext();
		ctx.store.seed('assignment_types', [{ id: 'at-1', organization_id: 'test-org', exempt_personnel_ids: [] }]);

		const result = await handleUseCaseRequest(_putConfig, ctx, {
			assignmentTypeId: 'at-1',
			personnelIds: ['p1', 'p2']
		});

		expect(result).toEqual({ exemptPersonnelIds: ['p1', 'p2'] });
	});

	it('defaults personnelIds to empty array when omitted', async () => {
		const ctx = createTestContext();
		ctx.store.seed('assignment_types', [{ id: 'at-1', organization_id: 'test-org', exempt_personnel_ids: ['old'] }]);

		const result = await handleUseCaseRequest(_putConfig, ctx, {
			assignmentTypeId: 'at-1'
		});

		expect(result).toEqual({ exemptPersonnelIds: [] });
	});

	it('rejects when assignmentTypeId is missing', async () => {
		const ctx = createTestContext();

		await expect(handleUseCaseRequest(_putConfig, ctx, { personnelIds: [] })).rejects.toMatchObject({
			status: 400
		});
	});

	it('emits audit event', async () => {
		const ctx = createTestContext();
		ctx.store.seed('assignment_types', [{ id: 'at-1', organization_id: 'test-org', exempt_personnel_ids: [] }]);

		await handleUseCaseRequest(_putConfig, ctx, {
			assignmentTypeId: 'at-1',
			personnelIds: ['p1']
		});

		expect(ctx.auditPort.events).toHaveLength(1);
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'duty_roster_exemption.updated',
			resourceType: 'duty_roster_exemption'
		});
	});

	it('blocks mutation when read-only', async () => {
		const ctx = createTestContext({ readOnly: true });

		await expect(
			handleUseCaseRequest(_putConfig, ctx, { assignmentTypeId: 'at-1', personnelIds: [] })
		).rejects.toMatchObject({ status: 403 });
	});
});
