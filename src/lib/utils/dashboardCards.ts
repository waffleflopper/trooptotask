import type { OrganizationMemberPermissions } from '$lib/types';

export type DashboardCardId = 'strength' | 'duty' | 'training' | 'upcoming' | 'ratings' | 'onboardings' | 'groups';

const CARD_PERMISSIONS: { id: DashboardCardId; permission: keyof OrganizationMemberPermissions }[] = [
	{ id: 'strength', permission: 'canViewCalendar' },
	{ id: 'duty', permission: 'canViewCalendar' },
	{ id: 'training', permission: 'canViewTraining' },
	{ id: 'upcoming', permission: 'canViewCalendar' },
	{ id: 'ratings', permission: 'canViewLeadersBook' },
	{ id: 'onboardings', permission: 'canViewPersonnel' },
	{ id: 'groups', permission: 'canViewCalendar' }
];

export function getVisibleDashboardCards(permissions: OrganizationMemberPermissions): DashboardCardId[] {
	return CARD_PERMISSIONS.filter((card) => permissions[card.permission]).map((card) => card.id);
}
