import { describe, expect, it } from 'vitest';
import { WORKBOOK_MIME_TYPE } from '$lib/export/workbook';
import { _getConfig } from './+server';

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
});
