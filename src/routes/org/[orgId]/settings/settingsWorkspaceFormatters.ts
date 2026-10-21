type PermissionPreset = 'owner' | 'admin' | 'full-editor' | 'team-leader' | 'viewer' | 'custom';

export function normalizeOrganizationName(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

/** "02 NOV 24" for the day `dateStr` falls on in `timeZone`. */
export function formatRosterDate(dateStr: string, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		day: '2-digit',
		month: 'short',
		year: '2-digit'
	}).formatToParts(new Date(dateStr));
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
	return `${part('day')} ${part('month').toUpperCase()} ${part('year')}`;
}

export function pluralize(label: string, count: number): string {
	return count === 1 ? label : `${label}s`;
}

export function getPresetLabel(preset: PermissionPreset): string {
	switch (preset) {
		case 'owner':
			return 'Owner';
		case 'admin':
			return 'Admin';
		case 'full-editor':
			return 'Editor';
		case 'team-leader':
			return 'Operator';
		case 'viewer':
			return 'Viewer';
		case 'custom':
			return 'Custom';
	}
}
