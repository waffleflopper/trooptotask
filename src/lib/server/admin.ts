import type { SupabaseClient } from '@supabase/supabase-js';
import { validateUUID } from './validation';

export type AdminRole = 'super_admin' | 'support' | 'billing';

export async function isPlatformAdmin(
	supabase: SupabaseClient,
	userId: string
): Promise<boolean> {
	// Use the database function which is SECURITY DEFINER and bypasses RLS
	const { data, error: err } = await supabase.rpc('is_platform_admin');

	if (err) {
		console.error('Error checking platform admin status:', err);
		return false;
	}

	return data === true;
}

const PAGE_ACCESS: Record<string, AdminRole[]> = {
	dashboard: ['super_admin', 'support', 'billing'],
	users: ['super_admin', 'support'],
	organizations: ['super_admin', 'support'],
	'access-requests': ['super_admin', 'support'],
	feedback: ['super_admin', 'support'],
	subscriptions: ['super_admin', 'billing'],
	gifting: ['super_admin', 'billing'],
	audit: ['super_admin'],
	announcements: ['super_admin']
};

export function canAccessPage(role: AdminRole, page: string): boolean {
	const allowed = PAGE_ACCESS[page];
	if (!allowed) return false;
	return allowed.includes(role);
}

export function getAccessiblePages(role: AdminRole): string[] {
	return Object.entries(PAGE_ACCESS)
		.filter(([, roles]) => roles.includes(role))
		.map(([page]) => page);
}

export async function getAdminRole(
	supabase: SupabaseClient,
	userId: string
): Promise<AdminRole | null> {
	const { data, error: err } = await supabase
		.from('platform_admins')
		.select('role')
		.eq('user_id', userId)
		.eq('is_active', true)
		.single();

	if (err || !data) {
		return null;
	}

	return data.role as AdminRole;
}

interface SuspendRequest {
	type: string;
	targetId: string;
	action: string;
	reason?: string;
}

interface SuspendValidation {
	valid: boolean;
	type?: 'user' | 'org';
	targetId?: string;
	action?: 'suspend' | 'unsuspend';
	reason?: string;
	error?: string;
}

export function validateSuspendRequest(req: SuspendRequest): SuspendValidation {
	if (!req.type || !['user', 'org'].includes(req.type)) {
		return { valid: false, error: 'Invalid type' };
	}
	if (!req.targetId || !validateUUID(req.targetId)) {
		return { valid: false, error: 'Invalid target ID' };
	}
	if (!req.action || !['suspend', 'unsuspend'].includes(req.action)) {
		return { valid: false, error: 'Invalid action' };
	}
	return {
		valid: true,
		type: req.type as 'user' | 'org',
		targetId: req.targetId,
		action: req.action as 'suspend' | 'unsuspend',
		reason: req.reason?.trim() || undefined
	};
}

export function validateSearchQuery(query: string): string | null {
	if (!query || typeof query !== 'string') return null;
	const trimmed = query.trim();
	if (trimmed.length < 3) return null;
	return trimmed.slice(0, 100);
}
