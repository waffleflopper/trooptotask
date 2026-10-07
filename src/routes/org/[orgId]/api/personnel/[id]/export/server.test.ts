import { describe, expect, it } from 'vitest';
import { WORKBOOK_MIME_TYPE } from '$lib/utils/workbook';
import { createTestContext as createCalendarTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { withTrainingPersistence } from '$features/training/server/trainingPersistence.test-support.server';
import ExcelJS from 'exceljs';
import { _getConfig } from './+server';

const createTestContext = (options?: Parameters<typeof createCalendarTestContext>[0]) =>
	createCalendarTestContext(withTrainingPersistence(options));

const PERSONNEL_ID = '11111111-1111-4111-8111-111111111111';

describe('GET /api/personnel/[id]/export', () => {
	it('formats workbook buffers with the existing Excel MIME type and attachment header', () => {
		const response = _getConfig.formatOutput?.({
			_buffer: new TextEncoder().encode('workbook').buffer,
			_filename: 'SGT_Smith_Jamie-export-2026-05-20.xlsx'
		});

		expect(response?.headers.get('Content-Type')).toBe(WORKBOOK_MIME_TYPE);
		expect(response?.headers.get('Content-Disposition')).toBe(
			'attachment; filename="SGT_Smith_Jamie-export-2026-05-20.xlsx"'
		);
	});

	it.each([
		{ trainingAccess: 'none' as const, expectedTrainingRows: 0 },
		{ trainingAccess: 'view' as const, expectedTrainingRows: 1 }
	])(
		'exports request-visible Training records with $trainingAccess access and keeps availability history',
		async ({ trainingAccess, expectedTrainingRows }) => {
			const ctx = createTestContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						personnel: 'configure',
						calendar: 'none',
						training: trainingAccess,
						criticalTasks: 'none',
						onboarding: 'none',
						ratingScheme: 'none'
					},
					scopeSet: { kind: 'organization' }
				}
			});
			ctx.rawStore.seed('personnel', [
				{ id: PERSONNEL_ID, organization_id: ctx.auth.orgId, group_id: null, first_name: 'Jamie', last_name: 'Smith' }
			]);
			ctx.rawStore.seed('training_types', [
				{ id: 'training-1', organization_id: ctx.auth.orgId, name: 'Weapons Qual' },
				{ id: 'foreign-training', organization_id: 'foreign-org', name: 'Foreign Training' }
			]);
			ctx.rawStore.seed('personnel_trainings', [
				{
					id: 'completion-1',
					organization_id: ctx.auth.orgId,
					personnel_id: PERSONNEL_ID,
					training_type_id: 'training-1',
					completion_date: '2026-04-01'
				},
				{
					id: 'other-person-completion',
					organization_id: ctx.auth.orgId,
					personnel_id: 'other-person',
					training_type_id: 'training-1',
					completion_date: '2026-05-01'
				},
				{
					id: 'foreign-completion',
					organization_id: 'foreign-org',
					personnel_id: PERSONNEL_ID,
					training_type_id: 'foreign-training',
					completion_date: '2026-06-01'
				}
			]);
			const requestRead = ctx.rawStore.findMany.bind(ctx.rawStore);
			// The real request store applies Training RLS; this in-memory store does not.
			ctx.rawStore.findMany = async (...args) =>
				trainingAccess === 'none' && ['personnel_trainings', 'training_types'].includes(args[0])
					? []
					: requestRead(...args);
			ctx.rawStore.seed('status_types', [{ id: 'status-1', organization_id: ctx.auth.orgId, name: 'TDY' }]);
			ctx.rawStore.seed('availability_entries', [
				{
					id: 'old',
					organization_id: ctx.auth.orgId,
					personnel_id: PERSONNEL_ID,
					status_type_id: 'status-1',
					start_date: '2025-01-01',
					end_date: '2025-01-03'
				},
				{
					id: 'new',
					organization_id: ctx.auth.orgId,
					personnel_id: PERSONNEL_ID,
					status_type_id: 'status-1',
					start_date: '2026-01-01',
					end_date: '2026-01-03'
				}
			]);

			const result = await _getConfig.fn(ctx, { personnelId: PERSONNEL_ID });
			const workbook = new ExcelJS.Workbook();
			await workbook.xlsx.load(
				Buffer.from(result._buffer) as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]
			);
			const history = workbook.getWorksheet('Availability History');
			const training = workbook.getWorksheet('Training Records');
			expect(training?.getRow(1).values).toEqual([
				undefined,
				'Training Type',
				'Completed Date',
				'Expiration Date',
				'Notes'
			]);
			expect(training?.rowCount).toBe(expectedTrainingRows + 1);
			if (trainingAccess === 'view') {
				expect(training?.getRow(2).getCell(1).value).toBe('Weapons Qual');
				expect(training?.getRow(2).getCell(2).value).toBe('2026-04-01');
			}
			expect(history?.getRow(2).getCell(1).value).toBe('TDY');
			expect(history?.getRow(2).getCell(2).value).toBe('2026-01-01');
			expect(history?.getRow(3).getCell(2).value).toBe('2025-01-01');
		}
	);
});
