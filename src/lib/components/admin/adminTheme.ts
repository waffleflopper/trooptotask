export const ADMIN_TIER_COLORS: Record<string, string> = {
	free: 'var(--ink-35)',
	team: 'var(--info)',
	unit: 'var(--amber-dark)'
};

export const ADMIN_ROLE_COLORS: Record<string, string> = {
	owner: 'var(--amber-dark)',
	admin: 'var(--info)',
	member: 'var(--ink-35)'
};

export const ADMIN_STATUS_COLORS: Record<string, string> = {
	active: 'var(--success)',
	suspended: 'var(--danger)',
	gifted: 'var(--amber-dark)',
	approved: 'var(--success)',
	rejected: 'var(--danger)',
	reviewed: 'var(--ink-35)',
	info: 'var(--info)',
	warning: 'var(--amber-dark)',
	critical: 'var(--danger)',
	bug: 'var(--danger)',
	feature: 'var(--info)',
	general: 'var(--ink-35)',
	new: 'var(--amber-dark)',
	resolved: 'var(--success)',
	maintenance: 'var(--danger)',
	expired: 'var(--ink-35)'
};

export function formatAdminLabel(value: string): string {
	return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
