import type { BadgeVariant } from '$lib/components/ui/badge';

export const ADMIN_TIER_COLORS: Record<string, string> = {
	free: 'var(--muted-foreground)',
	team: 'var(--chart-3)',
	unit: 'var(--accent)'
};

export const ADMIN_ROLE_COLORS: Record<string, string> = {
	owner: 'var(--accent)',
	admin: 'var(--chart-3)',
	member: 'var(--muted-foreground)'
};

export const ADMIN_STATUS_COLORS: Record<string, string> = {
	active: 'var(--chart-2)',
	suspended: 'var(--destructive)',
	gifted: 'var(--accent)',
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
			return 'success';
		case 'suspended':
		case 'rejected':
		case 'critical':
		case 'bug':
		case 'maintenance':
			return 'danger';
		case 'gifted':
		case 'admin_gift':
		case 'feature_override':
		case 'new':
		case 'unit':
		case 'owner':
		case 'warning':
			return 'warning';
		case 'stripe_billing':
		case 'team':
		case 'admin':
		case 'info':
		case 'feature':
			return 'info';
		default:
			return 'secondary';
	}
}

export function adminPlanStatusBadgeVariant(value: string | null | undefined): BadgeVariant {
	switch (value) {
		case 'over_limit':
		case 'read_only':
			return 'destructive';
		case 'limit_reached':
			return 'warning';
		case 'within_limit':
			return 'success';
		default:
			return 'secondary';
	}
}
