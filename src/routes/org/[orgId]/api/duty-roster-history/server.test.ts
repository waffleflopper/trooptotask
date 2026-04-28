import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

function makeManualImportPayload(overrides: Record<string, unknown> = {}) {
	return {
		assignmentTypeId: 'at-1',
		name: 'Manual history import - Staff Duty - 2026-04-09',
		startDate: '2026-04-09',
		endDate: '2026-04-09',
		roster: [
			{
				date: '2026-04-09',
				assigneeId: 'person-1',
				assigneeName: 'Nolan, Casey',
				assigneeRank: 'SGT',
				assigneeGroup: 'Headquarters',
				reason: 'Copied from signed DA6.'
			}
		],
		config: {
			historySource: 'manual-history-import',
			sourceNote: 'Copied from signed DA6.'
		},
		...overrides
	};
}

describe('POST /api/duty-roster-history', () => {
	it('persists manual history imports as explicitly non-generated history', async () => {
		const ctx = createTestContext();

		const result = await handleUseCaseRequest(_postConfig, ctx, makeManualImportPayload());

		expect(result).toMatchObject({
			assignmentTypeId: 'at-1',
			startDate: '2026-04-09',
			endDate: '2026-04-09',
			config: {
				historySource: 'manual-history-import',
				sourceNote: 'Copied from signed DA6.'
			}
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'duty_roster.manual_history_imported',
				resourceType: 'duty_roster'
			})
		]);
	});

	it('rejects manual history imports without a charged Soldier', async () => {
		const ctx = createTestContext();

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				makeManualImportPayload({
					roster: [{ date: '2026-04-09', assigneeId: null }]
				})
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Manual history imports require a charged Soldier for each duty row.'
		});
	});
});
