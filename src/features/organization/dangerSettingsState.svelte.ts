import type { DangerSettingsData, SettingsDangerSectionData } from './dangerSettingsTypes';

export class SettingsDangerZoneState {
	readonly #getSettings: () => DangerSettingsData;

	showDeleteConfirm = $state(false);
	deleteConfirmText = $state('');

	constructor(settings: DangerSettingsData | (() => DangerSettingsData)) {
		this.#getSettings = typeof settings === 'function' ? settings : () => settings;
	}

	get section(): SettingsDangerSectionData {
		return this.#getSettings().sections.dangerZone;
	}

	get deleteConfirmMatches(): boolean {
		return (
			this.deleteConfirmText.trim().replace(/\s+/g, ' ') === this.section.deleteConfirmation.normalizedOrganizationName
		);
	}

	get deleteOrganizationCloseBlocked(): boolean {
		return this.deleteConfirmText.trim() !== '';
	}

	openDeleteConfirmation(): void {
		this.showDeleteConfirm = true;
	}

	closeDeleteConfirmation(): void {
		this.showDeleteConfirm = false;
		this.deleteConfirmText = '';
	}
}

export function createSettingsDangerZoneState(
	settings: DangerSettingsData | (() => DangerSettingsData)
): SettingsDangerZoneState {
	return new SettingsDangerZoneState(settings);
}
