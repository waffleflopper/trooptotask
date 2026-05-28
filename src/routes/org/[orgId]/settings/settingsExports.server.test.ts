import { describe, expect, it } from 'vitest';
import { buildExportsSettingsData } from './settingsExports.server';

describe('exports settings read model', () => {
	it('builds export limits without unrelated settings sections', () => {
		const exportsSettings = buildExportsSettingsData({
			exportInfo: {
				exportsUsed: 3,
				exportsLimit: 3,
				isLimited: true
			}
		});

		expect(exportsSettings).toEqual({
			sections: {
				exports: {
					exportInfo: {
						exportsUsed: 3,
						exportsLimit: 3,
						isLimited: true,
						limitReached: true,
						planBadge: 'Plan limited'
					},
					commands: {
						canExportJson: false,
						canExportExcel: false
					}
				}
			}
		});
		expect('members' in exportsSettings.sections).toBe(false);
		expect('archivedPersonnel' in exportsSettings.sections).toBe(false);
		expect('dangerZone' in exportsSettings.sections).toBe(false);
		expect('approvals' in exportsSettings.sections).toBe(false);
	});
});
