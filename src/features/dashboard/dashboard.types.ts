// ---------------------------------------------------------------------------
// Widget identity
// ---------------------------------------------------------------------------

export type WidgetId =
	| 'strength' // Strength Today
	| 'non-available' // Non-Available Personnel
	| 'duty' // Duty Roster
	| 'evaluations' // Evaluation Pipeline
	| 'training' // Training Health
	| 'onboarding' // Onboarding Status
	| 'quick-stats' // Quick Stats (configurable metrics)
	| 'upcoming-losses' // Upcoming Losses — placeholder
	| 'ictl'; // Critical Tasks / ICTL — placeholder

// Visual column span in the 3-column grid.
// 1 = fills one column slot (default)
// 2 = fills two column slots
// 3 = full-width row (pushes all other content)
export type ColSpan = 1 | 2 | 3;

// Kept for backward-compat with persisted configs; no longer used in UI.
export type WidgetSize = 3 | 4 | 6 | 12;

export type DashboardPermission =
	| 'canViewCalendar'
	| 'canViewTraining'
	| 'canViewLeadersBook'
	| 'canViewOnboarding'
	| 'canViewPersonnel';

export type DashboardPermissions = Partial<Record<DashboardPermission, boolean>> | null | undefined;

// ---------------------------------------------------------------------------
// Quick Stats metric catalog
// ---------------------------------------------------------------------------

export type QuickStatMetricId =
	| 'present-strength'
	| 'total-strength'
	| 'non-available-today'
	| 'on-leave'
	| 'training-currency'
	| 'expired-training'
	| 'onboardings-in-progress'
	| 'evaluations-overdue'
	| 'evaluations-due-30';

export interface QuickStatMetric {
	id: QuickStatMetricId;
	label: string;
	description: string;
	permission?: DashboardPermission;
}

export const QUICK_STAT_METRICS: QuickStatMetric[] = [
	{
		id: 'present-strength',
		label: 'Present Strength',
		description: 'Personnel available today',
		permission: 'canViewCalendar'
	},
	{
		id: 'total-strength',
		label: 'Total Strength',
		description: 'All active personnel',
		permission: 'canViewPersonnel'
	},
	{
		id: 'non-available-today',
		label: 'Non-Available',
		description: 'Personnel unavailable today',
		permission: 'canViewCalendar'
	},
	{ id: 'on-leave', label: 'On Leave', description: 'Personnel on leave today', permission: 'canViewCalendar' },
	{
		id: 'training-currency',
		label: 'Training Currency',
		description: '% with all training current',
		permission: 'canViewTraining'
	},
	{
		id: 'expired-training',
		label: 'Expired Training',
		description: 'Total expired training records',
		permission: 'canViewTraining'
	},
	{
		id: 'onboardings-in-progress',
		label: 'Onboardings Active',
		description: 'In-progress onboardings',
		permission: 'canViewOnboarding'
	},
	{
		id: 'evaluations-overdue',
		label: 'Evals Overdue',
		description: 'Overdue evaluations',
		permission: 'canViewLeadersBook'
	},
	{
		id: 'evaluations-due-30',
		label: 'Evals Due (30d)',
		description: 'Evaluations due within 30 days',
		permission: 'canViewLeadersBook'
	}
];

export const DEFAULT_QUICK_STAT_METRICS: QuickStatMetricId[] = [
	'present-strength',
	'training-currency',
	'evaluations-overdue'
];

// ---------------------------------------------------------------------------
// Per-widget configuration (all optional — widgets use sensible defaults)
// ---------------------------------------------------------------------------

export interface WidgetInstanceConfig {
	// strength
	showGroupBreakdown?: boolean;
	// non-available
	statusTypeFilter?: string[]; // statusTypeIds to include; empty = all
	// duty
	dayCount?: number; // how many days ahead to show (default 2)
	// evaluations
	lookaheadDays?: number; // 30 | 60 | 90 (default 60)
	// training
	display?: 'chart' | 'list' | 'both'; // default 'both'
	breakdown?: 'group' | 'person'; // default 'group'
	// quick-stats
	metrics?: QuickStatMetricId[]; // ordered list of chosen metrics (default 3)
}

// ---------------------------------------------------------------------------
// Widget instance — one item in the user's layout
// ---------------------------------------------------------------------------

export interface WidgetInstance {
	/** Stable unique key for svelte-dnd-action tracking */
	id: string;
	widgetId: WidgetId;
	/** @deprecated kept for backward compat with saved v1/v2 configs */
	size?: WidgetSize;
	/** @deprecated kept for backward compat with saved v1/v2 configs */
	col?: number;
	/**
	 * How many of the 3 grid columns this widget occupies.
	 * 1 (default) = one slot; 2 = two slots; 3 = full-width row.
	 * Full-width widgets (colSpan 3) start a new row and push content below.
	 */
	colSpan?: ColSpan;
	config: WidgetInstanceConfig;
}

// ---------------------------------------------------------------------------
// Persisted dashboard config shape (stored in dashboard_configs.config JSONB)
// ---------------------------------------------------------------------------

export interface DashboardConfig {
	widgets: WidgetInstance[];
	version: number;
}

// ---------------------------------------------------------------------------
// Widget metadata (for picker UI)
// ---------------------------------------------------------------------------

export interface WidgetMeta {
	id: WidgetId;
	label: string;
	description: string;
	defaultSize: WidgetSize;
	placeholder?: boolean; // not yet implemented
	permission?: DashboardPermission;
}

export const WIDGET_CATALOG: WidgetMeta[] = [
	{
		id: 'strength',
		label: 'Strength Today',
		description: 'Present vs. non-available count, broken down by group.',
		defaultSize: 4,
		permission: 'canViewCalendar'
	},
	{
		id: 'non-available',
		label: 'Non-Available Personnel',
		description: 'Who is out today and why, with expected return dates.',
		defaultSize: 6,
		permission: 'canViewCalendar'
	},
	{
		id: 'duty',
		label: 'Duty Roster',
		description: "Today's and tomorrow's duty assignments.",
		defaultSize: 4,
		permission: 'canViewCalendar'
	},
	{
		id: 'evaluations',
		label: 'Evaluation Pipeline',
		description: 'Overdue and upcoming NCOERs and OERs.',
		defaultSize: 6,
		permission: 'canViewLeadersBook'
	},
	{
		id: 'training',
		label: 'Training Health',
		description: 'Expired and expiring training by group.',
		defaultSize: 12,
		permission: 'canViewTraining'
	},
	{
		id: 'onboarding',
		label: 'Onboarding Status',
		description: 'In-progress onboardings and completion progress.',
		defaultSize: 4,
		permission: 'canViewOnboarding'
	},
	{
		id: 'quick-stats',
		label: 'Quick Stats',
		description: 'Configurable single-number metric tiles.',
		defaultSize: 4
	},
	{
		id: 'upcoming-losses',
		label: 'Upcoming Losses',
		description: 'ETS and PCS departures within a configurable window.',
		defaultSize: 4,
		placeholder: true,
		permission: 'canViewPersonnel'
	},
	{
		id: 'ictl',
		label: 'Critical Tasks',
		description: 'Unit ICTL proficiency snapshot.',
		defaultSize: 4,
		placeholder: true,
		permission: 'canViewTraining'
	}
];

// ---------------------------------------------------------------------------
// Default starter layout (commander/1SG view)
// ---------------------------------------------------------------------------

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
	version: 3,
	widgets: [
		// Row 1: three equal-width summary widgets
		{ id: 'default-1', widgetId: 'strength', config: { showGroupBreakdown: true } },
		{ id: 'default-2', widgetId: 'duty', config: { dayCount: 2 } },
		{
			id: 'default-3',
			widgetId: 'quick-stats',
			config: { metrics: ['present-strength', 'training-currency', 'evaluations-overdue'] }
		},
		// Row 2: two wider widgets
		{ id: 'default-4', widgetId: 'non-available', colSpan: 2, config: {} },
		{ id: 'default-5', widgetId: 'evaluations', config: { lookaheadDays: 60 } },
		// Row 3: Training Health spans full width
		{ id: 'default-6', widgetId: 'training', colSpan: 3, config: { display: 'both', breakdown: 'group' } },
		// Row 4: three placeholders + onboarding
		{ id: 'default-7', widgetId: 'onboarding', config: {} },
		{ id: 'default-8', widgetId: 'upcoming-losses', config: {} },
		{ id: 'default-9', widgetId: 'ictl', config: {} }
	]
};

export function hasDashboardPermission(permissions: DashboardPermissions, permission?: DashboardPermission): boolean {
	if (!permission) return true;
	return permissions?.[permission] === true;
}

export function getAllowedQuickStatMetrics(permissions: DashboardPermissions): QuickStatMetric[] {
	return QUICK_STAT_METRICS.filter((metric) => hasDashboardPermission(permissions, metric.permission));
}

export function filterQuickStatMetricIds(
	metricIds: QuickStatMetricId[],
	permissions: DashboardPermissions
): QuickStatMetricId[] {
	const allowedIds = new Set(getAllowedQuickStatMetrics(permissions).map((metric) => metric.id));
	return metricIds.filter((metricId) => allowedIds.has(metricId));
}

export function isDashboardWidgetAllowed(widgetId: WidgetId, permissions: DashboardPermissions): boolean {
	const meta = WIDGET_CATALOG.find((widget) => widget.id === widgetId);
	if (!meta) return false;
	if (!hasDashboardPermission(permissions, meta.permission)) return false;
	if (widgetId === 'quick-stats') {
		return getAllowedQuickStatMetrics(permissions).length > 0;
	}
	return true;
}

export function filterDashboardWidgets(
	widgets: WidgetInstance[],
	permissions: DashboardPermissions,
	options: { pruneEmptyQuickStats?: boolean } = {}
): WidgetInstance[] {
	const pruneEmptyQuickStats = options.pruneEmptyQuickStats ?? false;

	return widgets
		.filter((widget) => isDashboardWidgetAllowed(widget.widgetId, permissions))
		.map((widget) => {
			if (widget.widgetId !== 'quick-stats') return widget;

			const requestedMetrics = widget.config.metrics ?? DEFAULT_QUICK_STAT_METRICS;
			const metrics = filterQuickStatMetricIds(requestedMetrics, permissions);
			return {
				...widget,
				config: {
					...widget.config,
					metrics
				}
			};
		})
		.filter((widget) => {
			if (!pruneEmptyQuickStats || widget.widgetId !== 'quick-stats') return true;
			return (widget.config.metrics?.length ?? 0) > 0;
		});
}

export function getPermissionAwareDashboardConfig(
	config: DashboardConfig,
	permissions: DashboardPermissions
): DashboardConfig {
	return {
		...config,
		widgets: filterDashboardWidgets(config.widgets, permissions, { pruneEmptyQuickStats: true })
	};
}

function widgetConfigValuesMatch(
	actual: WidgetInstanceConfig[keyof WidgetInstanceConfig],
	expected: WidgetInstanceConfig[keyof WidgetInstanceConfig]
): boolean {
	if (Array.isArray(actual) || Array.isArray(expected)) {
		if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
		return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
	}

	return actual === expected;
}

function widgetConfigsMatch(actual: WidgetInstanceConfig, expected: WidgetInstanceConfig): boolean {
	const keys = new Set<keyof WidgetInstanceConfig>([
		...(Object.keys(actual) as (keyof WidgetInstanceConfig)[]),
		...(Object.keys(expected) as (keyof WidgetInstanceConfig)[])
	]);

	return [...keys].every((key) => widgetConfigValuesMatch(actual[key], expected[key]));
}

function widgetsMatch(actual: WidgetInstance, expected: WidgetInstance): boolean {
	return (
		actual.id === expected.id &&
		actual.widgetId === expected.widgetId &&
		actual.size === expected.size &&
		actual.col === expected.col &&
		actual.colSpan === expected.colSpan &&
		widgetConfigsMatch(actual.config, expected.config)
	);
}

export function isDefaultDashboardConfig(config: DashboardConfig): boolean {
	return (
		config.version === DEFAULT_DASHBOARD_CONFIG.version &&
		config.widgets.length === DEFAULT_DASHBOARD_CONFIG.widgets.length &&
		config.widgets.every((widget, index) => {
			const defaultWidget = DEFAULT_DASHBOARD_CONFIG.widgets[index];
			return defaultWidget !== undefined && widgetsMatch(widget, defaultWidget);
		})
	);
}

export function mergeVisibleWidgetOrder(
	allWidgets: WidgetInstance[],
	visibleWidgets: WidgetInstance[],
	permissions: DashboardPermissions
): WidgetInstance[] {
	const nextVisibleWidgets = [...visibleWidgets];
	return allWidgets.map((widget) => {
		if (!isDashboardWidgetAllowed(widget.widgetId, permissions)) return widget;
		return nextVisibleWidgets.shift() ?? widget;
	});
}
