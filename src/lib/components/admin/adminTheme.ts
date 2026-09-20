import type { BadgeVariant } from '$lib/components/ui/badge';

export const ADMIN_ROLE_COLORS: Record<string, string> = {
	owner: 'var(--accent)',
	admin: 'var(--chart-3)',
	member: 'var(--muted-foreground)'
};

export const ADMIN_STATUS_COLORS: Record<string, string> = {
	active: 'var(--chart-2)',
	suspended: 'var(--destructive)',
	approved: 'var(--chart-2)',
	rejected: 'var(--destructive)',
	reviewed: 'var(--muted-foreground)',
	info: 'var(--chart-3)',
	warning: 'var(--accent)',
	critical: 'var(--destructive)',
	bug: 'var(--destructive)',
	feature: 'var(--chart-3)',
	general: 'var(--muted-foreground)',
	new: 'var(--accent)',
	resolved: 'var(--chart-2)',
	maintenance: 'var(--destructive)',
	expired: 'var(--muted-foreground)'
};

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
