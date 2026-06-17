import { describe, expect, it } from 'vitest';
import { buildExportsSettingsData } from './settingsExports.server';

describe('exports settings read model', () => {
	it('builds export limits without unrelated settings sections', () => {
		const exportsSettings = buildExportsSettingsData({
			exportInfo: {
				exportsUsed: 3,
				exportsLimit: 3,
				isLimited: true,
				upgradeTarget: 'team'
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
						planBadge: 'Plan limited',
						upgradeTarget: 'team',
						limitReachedRemediation: 'Export limit reached. Upgrade to Team for more monthly exports.'
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

	it.each([
		{
			upgradeTarget: 'unit' as const,
			expected: 'Export limit reached. Upgrade to Unit for unlimited exports.'
		},
		{
			upgradeTarget: null,
			expected: 'Export limit reached. Contact support for export access.'
		}
	])('maps remediation copy for $upgradeTarget export targets', ({ upgradeTarget, expected }) => {
		const exportsSettings = buildExportsSettingsData({
			exportInfo: {
				exportsUsed: 10,
				exportsLimit: 10,
				isLimited: true,
				upgradeTarget
			}
		});

		expect(exportsSettings.sections.exports.exportInfo.limitReachedRemediation).toBe(expected);
	});
});
