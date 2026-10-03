import type { SettingsArchivedPersonnelRow, SettingsArchivesSectionData } from './settingsSectionTypes';

export class SettingsArchivedPersonnelState {
	readonly #getSection: () => SettingsArchivesSectionData;

	confirmPermanentDelete = $state<{ id: string; name: string } | null>(null);
	permanentDeleteConfirmText = $state('');

	constructor(section: SettingsArchivesSectionData | (() => SettingsArchivesSectionData)) {
		this.#getSection = typeof section === 'function' ? section : () => section;
	}

	get rows(): SettingsArchivesSectionData['rows'] {
		return this.#getSection().rows;
	}

	get retention(): SettingsArchivesSectionData['retention'] {
		return this.#getSection().retention;
	}

	get commands(): SettingsArchivesSectionData['commands'] {
		return this.#getSection().commands;
	}

	openPermanentDeleteConfirmation(person: Pick<SettingsArchivedPersonnelRow, 'id' | 'displayName'>): void {
		this.confirmPermanentDelete = {
			id: person.id,
			name: person.displayName
		};
		this.permanentDeleteConfirmText = '';
	}

	clearPermanentDeleteConfirmation(): void {
		this.confirmPermanentDelete = null;
		this.permanentDeleteConfirmText = '';
	}

	get permanentDeleteConfirmMatches(): boolean {
		return this.permanentDeleteConfirmText.trim().replace(/\s+/g, ' ') === this.confirmPermanentDelete?.name;
	}
}

export function createSettingsArchivedPersonnelState(
	section: SettingsArchivesSectionData | (() => SettingsArchivesSectionData)
): SettingsArchivedPersonnelState {
	return new SettingsArchivedPersonnelState(section);
}
