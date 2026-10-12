import type { BadgeVariant } from '$lib/components/ui/badge';

export function formatAdminLabel(value: string): string {
	return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function adminBadgeVariant(value: string | null | undefined): BadgeVariant {
	switch (value) {
		case 'active':
		case 'approved':
		case 'resolved':
		case 'activated':
			return 'success';
		case 'suspended':
		case 'rejected':
		case 'rescinded':
		case 'critical':
		case 'bug':
		case 'maintenance':
		case 'diagnostics_unavailable':
			return 'danger';
		case 'new':
		case 'owner':
		case 'warning':
		case 'needs_attention':
			return 'warning';
		case 'admin':
		case 'info':
		case 'feature':
		case 'in_progress':
			return 'info';
		default:
			return 'secondary';
	}
}
