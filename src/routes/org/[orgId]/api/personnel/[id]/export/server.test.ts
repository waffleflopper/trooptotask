import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { WORKBOOK_MIME_TYPE } from '$lib/export/workbook';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { exportPersonnelWorkbook } from '$lib/server/core/useCases/personnelExport';
import { _getConfig } from './+server';

vi.mock('$lib/server/core/useCases/personnelExport', () => ({
	exportPersonnelWorkbook: vi.fn()
}));

describe('GET /api/personnel/[id]/export', () => {
	beforeEach(() => {
		vi.mocked(exportPersonnelWorkbook).mockReset();
	});

	it('declares policy-first authorization for Personnel export', () => {
		expect(_getConfig).toMatchObject({
			policyAction: POLICY_ACTION_CATALOG.personnel.exportRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect('permission' in _getConfig).toBe(false);
	});

	it('delegates workbook export orchestration to the Personnel export use case', async () => {
		const ctx = createTestContext();
		const output = {
			_buffer: new ArrayBuffer(4),
			_filename: 'SGT_Smith_Jamie-export-2026-05-20.xlsx'
		};
		vi.mocked(exportPersonnelWorkbook).mockResolvedValue(output);

		const result = await handleUseCaseRequest(_getConfig, ctx, { personnelId: 'p-1' });

		expect(result).toBe(output);
		expect(exportPersonnelWorkbook).toHaveBeenCalledOnce();
		expect(exportPersonnelWorkbook).toHaveBeenCalledWith(ctx, { personnelId: 'p-1' });
	});

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
});
