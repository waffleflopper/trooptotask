import type { PermissionPreset } from '$lib/types';

export function normalizeOrganizationName(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

function formatActionSegment(segment: string): string {
	return segment.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getAuditActionParts(action: string): { area: string; event: string } {
	const [area = action, ...eventParts] = action.split(/[.>]/);
	const event = eventParts.join(' ') || area;
	return {
		area: formatActionSegment(area),
		event: formatActionSegment(event)
	};
}

export function getAuditTone(action: string): string {
	const area = action.split(/[.>_]/)[0] ?? '';
	switch (area) {
		case 'billing':
		case 'export':
		case 'data':
			return 'info';
		case 'personnel':
		case 'member':
		case 'members':
			return 'danger';
		case 'training':
		case 'critical':
			return 'success';
		case 'duty':
		case 'calendar':
			return 'warning';
		default:
			return 'neutral';
	}
}

export function formatAuditTimestamp(dateStr: string): string {
	const date = new Date(dateStr);
	const day = date.toLocaleDateString('en-US', { day: '2-digit' });
	const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
	const time = date.toLocaleTimeString('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	return `${day} ${month} · ${time}`;
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

export function formatPrice(cents: number): string {
	if (cents === 0) return 'Free';
	return `$${(cents / 100).toFixed(0)}/mo`;
}

export function formatCap(cap: number): string {
	return cap === Infinity ? 'Unlimited' : String(cap);
}

export function formatExportLimit(limit: number | null): string {
	return limit === null || limit === Infinity ? 'exports' : `${limit} exports/mo`;
}
