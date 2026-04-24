import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import type { HydrationPlan } from '$lib/server/core/orgShell';
import type { OrganizationMemberPermissions } from '$lib/types';
import type { TrainingStats } from '$features/training/utils/trainingStatus';

// ---------------------------------------------------------------------------
// Dashboard tab identity
// ---------------------------------------------------------------------------

export type DashboardTabId = 'unit-readiness' | 'people-duty' | 'training-evals';

const ALL_TABS: DashboardTabId[] = ['unit-readiness', 'people-duty', 'training-evals'];

// ---------------------------------------------------------------------------
// Dashboard permissions
// ---------------------------------------------------------------------------

export type DashboardPermission =
	| 'canViewCalendar'
	| 'canViewTraining'
	| 'canViewRatingScheme'
	| 'canViewOnboarding'
	| 'canViewPersonnel';

export type DashboardPermissions = Partial<Record<DashboardPermission, boolean>> | null | undefined;

export function hasDashboardPermission(permissions: DashboardPermissions, permission?: DashboardPermission): boolean {
	if (!permission) return true;
	return permissions?.[permission] === true;
}

// ---------------------------------------------------------------------------
// Persisted dashboard config shape (stored in dashboard_configs.config JSONB)
// ---------------------------------------------------------------------------

export interface WidgetInstance {
	id: string;
	widgetId: string;
	config?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface DashboardConfig {
	widgets: WidgetInstance[];
	version: number;
	defaultTab?: DashboardTabId;
	[key: string]: unknown;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
	version: 3,
	widgets: []
};

export function isDashboardTabId(value: unknown): value is DashboardTabId {
	return typeof value === 'string' && ALL_TABS.includes(value as DashboardTabId);
}

export function resolveDashboardTab(value: unknown): DashboardTabId {
	return isDashboardTabId(value) ? value : 'unit-readiness';
}

export function normalizeDashboardConfig(value: unknown): DashboardConfig {
	const maybeConfig = value as Partial<DashboardConfig> | null | undefined;
	return {
		...DEFAULT_DASHBOARD_CONFIG,
		...(maybeConfig ?? {}),
		version: typeof maybeConfig?.version === 'number' ? maybeConfig.version : DEFAULT_DASHBOARD_CONFIG.version,
		widgets: Array.isArray(maybeConfig?.widgets) ? maybeConfig.widgets : DEFAULT_DASHBOARD_CONFIG.widgets,
		defaultTab: resolveDashboardTab(maybeConfig?.defaultTab)
	};
}

export interface TrainingIssue {
	personName: string;
	typeName: string;
	status: string;
	label: string;
}

// Shape of page data from (dashboard)/+layout.server.ts + +page.server.ts
export interface DashboardPageData {
	orgId: string;
	orgName: string;
	userId: string | null;
	permissions: OrganizationMemberPermissions | null;
	dashboard: { data: DashboardBootstrap; hydration?: HydrationPlan; workspace: string };
	trainingSummary: { stats: TrainingStats; issues: TrainingIssue[] } | null;
	onboardingTrainingCompletions: string[];
	onboardingTemplateStepCount?: number;
	ratingSchemeEntryCount?: number;
	orgMemberCount?: number;
	gettingStartedDismissed?: boolean;
	[key: string]: unknown;
}
