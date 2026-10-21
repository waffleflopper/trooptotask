type PermissionPreset = 'owner' | 'admin' | 'full-editor' | 'team-leader' | 'viewer' | 'custom';

export function normalizeOrganizationName(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

export function formatRosterDate(dateStr: string): string {
	const date = new Date(dateStr);
	const day = date.toLocaleDateString('en-US', { day: '2-digit' });
	const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
	const year = date.toLocaleDateString('en-US', { year: '2-digit' });
	return `${day} ${month} ${year}`;
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

export function formatCompactDate(date: Date): string {
	return date
		.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: '2-digit'
		})
		.toUpperCase();
}
