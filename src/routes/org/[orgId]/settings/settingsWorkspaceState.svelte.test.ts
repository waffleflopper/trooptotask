import { describe, expect, it } from 'vitest';
import type { SettingsArchivesSectionData } from './settingsSectionTypes';
import { createSettingsArchivedPersonnelState } from './settingsWorkspaceState.svelte';

type SettingsStateTestData = {
	sections: {
		archivedPersonnel: SettingsArchivesSectionData;
	};
};

function makeSettingsData(): SettingsStateTestData {
	return {
		sections: {
			archivedPersonnel: {
				rows: [
					{
						id: 'person-1',
						rank: 'SGT',
						firstName: 'Avery',
						lastName: 'Jones',
						mos: '11B',
						groupName: 'HQ',
						archivedAt: '2026-04-01T12:00:00Z',
						groupId: 'group-1',
						displayName: 'SGT Jones, Avery',
						exportFileStem: 'SGT-Jones'
					}
				],
				retention: {
					months: 36,
					purgeSummary: '1 archived record'
				},
				commands: {
					canRestore: true,
					canExport: true,
					canPermanentlyDelete: true
				}
			}
		}
	};
}

describe('settings workspace state', () => {
	it('owns archived personnel delete confirmation command state from Archives section data', () => {
		const state = createSettingsArchivedPersonnelState(makeSettingsData().sections.archivedPersonnel);
		const archivedPerson = state.rows[0];

		state.openPermanentDeleteConfirmation(archivedPerson);

		expect(state.confirmPermanentDelete).toEqual({
			id: 'person-1',
			name: 'SGT Jones, Avery'
		});
		expect(state.permanentDeleteConfirmMatches).toBe(false);

		state.permanentDeleteConfirmText = 'SGT Jones, Avery';

		expect(state.permanentDeleteConfirmMatches).toBe(true);

		state.clearPermanentDeleteConfirmation();

		expect(state.confirmPermanentDelete).toBeNull();
		expect(state.permanentDeleteConfirmText).toBe('');
	});
});
