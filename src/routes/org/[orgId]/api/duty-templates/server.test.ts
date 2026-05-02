import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig, _putConfig } from './+server';
import { _deleteConfig as archiveTemplateConfig } from './[templateId]/+server';

function makePayload(overrides: Record<string, unknown> = {}) {
	return {
		status: 'draft',
		name: 'Company CQ',
		scopeType: 'groups',
		scopeGroupIds: ['group-hq'],
		coverageMode: 'timed',
		startTime: '09:00',
		endTime: '09:00',
		isBlocking: true,
		cooldownHours: 8,
		slots: [
			{
				roleLabel: 'NCO',
				quantity: 1,
				allowedRanks: ['SGT'],
				allowedGroupIds: ['group-hq'],
				allowedMosValues: [],
				allowedRoleValues: []
			}
		],
		...overrides
	};
}

describe('POST /api/duty-templates', () => {
	it('exports a calendar mutation route config', () => {
		expect(_postConfig.permission).toBe('calendar');
		expect(_postConfig.mutation).toBe(true);
	});

	it('creates a template aggregate', async () => {
		const ctx = createTestContext();

		const result = await handleUseCaseRequest(_postConfig, ctx, makePayload());

		expect(result).toMatchObject({
			name: 'Company CQ',
			status: 'draft'
		});
		expect(result.slots).toHaveLength(1);
	});

	it('rejects unscoped full editors who are not privileged from creating templates', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: false,
				isFullEditor: true
			}
		});

		await expect(handleUseCaseRequest(_postConfig, ctx, makePayload())).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty templates can only be managed by organization admins and owners.'
		});
	});

	it('rejects scoped full editors from advanced duty routes', async () => {
		const ctx = createTestContext({
			auth: {
				isPrivileged: true,
				scopeSet: { kind: 'groups', groupIds: ['group-hq'] }
			}
		});

		await expect(handleUseCaseRequest(_postConfig, ctx, makePayload())).rejects.toMatchObject({
			status: 403,
			message: 'Advanced duty is only available to full-organization editors.'
		});
	});
});

describe('PUT /api/duty-templates', () => {
	it('updates an existing template aggregate', async () => {
		const ctx = createTestContext();
		const created = await handleUseCaseRequest(_postConfig, ctx, makePayload());

		const updated = await handleUseCaseRequest(_putConfig, ctx, makePayload({ id: created.id, status: 'active' }));

		expect(updated).toMatchObject({
			id: created.id,
			status: 'active'
		});
	});
});

describe('DELETE /api/duty-templates/[templateId]', () => {
	it('archives an existing template', async () => {
		const ctx = createTestContext();
		const created = await handleUseCaseRequest(_postConfig, ctx, makePayload({ status: 'active' }));

		const archived = await handleUseCaseRequest(archiveTemplateConfig, ctx, {
			templateId: created.id
		});

		expect(archived).toMatchObject({
			id: created.id,
			status: 'archived'
		});
	});

	it('rejects invalid template ids before archive reaches the use case', async () => {
		const ctx = createTestContext();

		await expect(
			handleUseCaseRequest(archiveTemplateConfig, ctx, {
				templateId: 'not-a-uuid'
			})
		).rejects.toMatchObject({
			status: 400,
			message: 'Template ID must be a valid UUID.'
		});
	});
});
