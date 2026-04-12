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

// Column span on a 12-column grid
export type WidgetSize = 3 | 4 | 6 | 12;

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
}

export const QUICK_STAT_METRICS: QuickStatMetric[] = [
	{ id: 'present-strength', label: 'Present Strength', description: 'Personnel available today' },
	{ id: 'total-strength', label: 'Total Strength', description: 'All active personnel' },
	{ id: 'non-available-today', label: 'Non-Available', description: 'Personnel unavailable today' },
	{ id: 'on-leave', label: 'On Leave', description: 'Personnel on leave today' },
	{ id: 'training-currency', label: 'Training Currency', description: '% with all training current' },
	{ id: 'expired-training', label: 'Expired Training', description: 'Total expired training records' },
	{ id: 'onboardings-in-progress', label: 'Onboardings Active', description: 'In-progress onboardings' },
	{ id: 'evaluations-overdue', label: 'Evals Overdue', description: 'Overdue evaluations' },
	{ id: 'evaluations-due-30', label: 'Evals Due (30d)', description: 'Evaluations due within 30 days' }
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
	size: WidgetSize;
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
	permission?: 'canViewCalendar' | 'canViewTraining' | 'canViewLeadersBook' | 'canViewOnboarding' | 'canViewPersonnel';
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
	version: 1,
	widgets: [
		{ id: 'default-1', widgetId: 'strength', size: 4, config: { showGroupBreakdown: true } },
		{ id: 'default-2', widgetId: 'duty', size: 4, config: { dayCount: 2 } },
		{
			id: 'default-3',
			widgetId: 'quick-stats',
			size: 4,
			config: { metrics: ['present-strength', 'training-currency', 'evaluations-overdue'] }
		},
		{ id: 'default-4', widgetId: 'non-available', size: 6, config: {} },
		{ id: 'default-5', widgetId: 'evaluations', size: 6, config: { lookaheadDays: 60 } },
		{ id: 'default-6', widgetId: 'training', size: 12, config: { display: 'both', breakdown: 'group' } },
		{ id: 'default-7', widgetId: 'onboarding', size: 4, config: {} },
		{ id: 'default-8', widgetId: 'upcoming-losses', size: 4, config: {} },
		{ id: 'default-9', widgetId: 'ictl', size: 4, config: {} }
	]
};
