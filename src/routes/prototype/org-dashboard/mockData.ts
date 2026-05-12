// PROTOTYPE — Organization Dashboard mock data. Delete when done.

export interface OrgStats {
	totalPersonnel: number;
	availableToday: number;
	availablePct: number;
	nonAvailableToday: number;
	trainingCurrency: number;
	evalsOverdue: number;
	evalsDueSoon: number;
	activeOnboardings: number;
	openPositions: number;
}

export interface GroupSummary {
	id: string;
	name: string;
	assigned: number;
	available: number;
	availablePct: number;
	trainingCurrency: number;
	evalsOverdue: number;
}

export interface StatusBreakdown {
	id: string;
	name: string;
	count: number;
	color: string;
	textColor: string;
}

export interface DutyAssignment {
	id: string;
	type: string;
	assignee: string;
	rank: string;
	group: string;
	period: 'today' | 'tomorrow';
}

export interface OnboardingEntry {
	id: string;
	name: string;
	rank: string;
	group: string;
	pct: number;
	startDate: string;
}

export interface UpcomingChange {
	id: string;
	personName: string;
	rank: string;
	group: string;
	date: string;
	direction: 'departing' | 'returning';
	statusName: string;
}

export interface AttentionItem {
	id: string;
	severity: 'danger' | 'warning' | 'info';
	category: 'training' | 'eval' | 'personnel' | 'onboarding';
	message: string;
	detail: string;
	count?: number;
}

export interface ActivityEntry {
	id: string;
	timestamp: string;
	type: 'personnel' | 'training' | 'duty' | 'onboarding' | 'calendar' | 'eval';
	message: string;
	detail?: string;
}

export const orgStats: OrgStats = {
	totalPersonnel: 147,
	availableToday: 128,
	availablePct: 87,
	nonAvailableToday: 19,
	trainingCurrency: 74,
	evalsOverdue: 8,
	evalsDueSoon: 12,
	activeOnboardings: 4,
	openPositions: 3
};

export const groups: GroupSummary[] = [
	{
		id: 'hq',
		name: 'HQ',
		assigned: 18,
		available: 16,
		availablePct: 89,
		trainingCurrency: 82,
		evalsOverdue: 1
	},
	{
		id: '1st-plt',
		name: '1st PLT',
		assigned: 32,
		available: 28,
		availablePct: 88,
		trainingCurrency: 78,
		evalsOverdue: 2
	},
	{
		id: '2nd-plt',
		name: '2nd PLT',
		assigned: 34,
		available: 31,
		availablePct: 91,
		trainingCurrency: 71,
		evalsOverdue: 1
	},
	{
		id: '3rd-plt',
		name: '3rd PLT',
		assigned: 30,
		available: 24,
		availablePct: 80,
		trainingCurrency: 68,
		evalsOverdue: 3
	},
	{
		id: 'wpns',
		name: 'WPNS',
		assigned: 33,
		available: 29,
		availablePct: 88,
		trainingCurrency: 72,
		evalsOverdue: 1
	}
];

export const statusBreakdown: StatusBreakdown[] = [
	{ id: 'leave', name: 'Leave', count: 7, color: '#3b82f6', textColor: '#ffffff' },
	{ id: 'tdy', name: 'TDY', count: 4, color: '#8b5cf6', textColor: '#ffffff' },
	{ id: 'appt', name: 'Appointment', count: 3, color: '#06b6d4', textColor: '#ffffff' },
	{ id: 'profile', name: 'Profile', count: 3, color: '#f59e0b', textColor: '#000000' },
	{ id: 'quarters', name: 'Quarters', count: 2, color: '#ef4444', textColor: '#ffffff' }
];

export const dutyAssignments: DutyAssignment[] = [
	{ id: 'd1', type: 'Staff Duty NCO', assignee: 'Martinez', rank: 'SSG', group: '1st PLT', period: 'today' },
	{ id: 'd2', type: 'Staff Duty Runner', assignee: 'Kim', rank: 'PFC', group: '2nd PLT', period: 'today' },
	{ id: 'd3', type: 'CQ', assignee: 'Johnson', rank: 'SGT', group: 'WPNS', period: 'today' },
	{ id: 'd4', type: 'Staff Duty NCO', assignee: 'Davis', rank: 'SSG', group: '3rd PLT', period: 'tomorrow' },
	{
		id: 'd5',
		type: 'Staff Duty Runner',
		assignee: 'Nguyen',
		rank: 'PV2',
		group: '1st PLT',
		period: 'tomorrow'
	},
	{ id: 'd6', type: 'CQ', assignee: 'Thompson', rank: 'SGT', group: 'HQ', period: 'tomorrow' }
];

export const onboardings: OnboardingEntry[] = [
	{ id: 'o1', name: 'PV2 Williams', rank: 'PV2', group: '1st PLT', pct: 72, startDate: '28 APR' },
	{ id: 'o2', name: 'PFC Anderson', rank: 'PFC', group: '3rd PLT', pct: 45, startDate: '02 MAY' },
	{ id: 'o3', name: 'PV2 Garcia', rank: 'PV2', group: '2nd PLT', pct: 88, startDate: '21 APR' },
	{ id: 'o4', name: 'SPC Baker', rank: 'SPC', group: 'WPNS', pct: 15, startDate: '08 MAY' }
];

export const upcomingChanges: UpcomingChange[] = [
	{
		id: 'c1',
		personName: 'SGT Rivera',
		rank: 'SGT',
		group: '2nd PLT',
		date: '14 MAY',
		direction: 'departing',
		statusName: 'Leave'
	},
	{
		id: 'c2',
		personName: 'SPC Chen',
		rank: 'SPC',
		group: '1st PLT',
		date: '14 MAY',
		direction: 'returning',
		statusName: 'TDY'
	},
	{
		id: 'c3',
		personName: 'PFC Taylor',
		rank: 'PFC',
		group: '3rd PLT',
		date: '15 MAY',
		direction: 'departing',
		statusName: 'TDY'
	},
	{
		id: 'c4',
		personName: 'SSG Park',
		rank: 'SSG',
		group: 'WPNS',
		date: '16 MAY',
		direction: 'returning',
		statusName: 'Leave'
	},
	{
		id: 'c5',
		personName: 'SGT Brown',
		rank: 'SGT',
		group: 'HQ',
		date: '17 MAY',
		direction: 'departing',
		statusName: 'Appointment'
	},
	{
		id: 'c6',
		personName: 'CPL Hayes',
		rank: 'CPL',
		group: '1st PLT',
		date: '18 MAY',
		direction: 'departing',
		statusName: 'Leave'
	}
];

export const attentionItems: AttentionItem[] = [
	{
		id: 'a1',
		severity: 'danger',
		category: 'training',
		message: '12 personnel with expired training',
		detail: 'Weapons Qual (5), SHARP (4), Cyber Awareness (3)',
		count: 12
	},
	{
		id: 'a2',
		severity: 'danger',
		category: 'eval',
		message: '8 overdue evaluations',
		detail: '3rd PLT (3), 1st PLT (2), 2nd PLT (1), WPNS (1), HQ (1)',
		count: 8
	},
	{
		id: 'a3',
		severity: 'warning',
		category: 'training',
		message: '19 training items expiring within 30 days',
		detail: 'ACFT (6), First Aid (5), NBC (4), Land Nav (4)',
		count: 19
	},
	{
		id: 'a4',
		severity: 'warning',
		category: 'eval',
		message: '12 evaluations due within 30 days',
		detail: 'Across all platoons',
		count: 12
	},
	{
		id: 'a5',
		severity: 'info',
		category: 'onboarding',
		message: '1 onboarding behind schedule',
		detail: 'SPC Baker — 15% complete, started 08 MAY',
		count: 1
	},
	{
		id: 'a6',
		severity: 'info',
		category: 'personnel',
		message: '3 open positions unfilled',
		detail: '2nd PLT (2), WPNS (1)'
	}
];

export const activityFeed: ActivityEntry[] = [
	{
		id: 'f1',
		timestamp: '0842',
		type: 'calendar',
		message: 'SGT Rivera submitted leave request',
		detail: '14–21 MAY'
	},
	{
		id: 'f2',
		timestamp: '0815',
		type: 'training',
		message: 'Weapons Qual results uploaded',
		detail: '2nd PLT — 28 of 34 qualified'
	},
	{
		id: 'f3',
		timestamp: '0730',
		type: 'duty',
		message: 'Staff Duty shift change',
		detail: 'SSG Martinez assumed duty'
	},
	{
		id: 'f4',
		timestamp: 'Yesterday',
		type: 'onboarding',
		message: 'PV2 Garcia completed weapons draw checklist',
		detail: '88% overall progress'
	},
	{
		id: 'f5',
		timestamp: 'Yesterday',
		type: 'personnel',
		message: 'SPC Chen TDY return updated',
		detail: 'Expected 14 MAY'
	},
	{
		id: 'f6',
		timestamp: 'Yesterday',
		type: 'training',
		message: 'SHARP training scheduled',
		detail: '19 MAY — 14 personnel assigned'
	},
	{
		id: 'f7',
		timestamp: '10 MAY',
		type: 'eval',
		message: 'SSG Davis NCOER submitted',
		detail: 'Pending senior rater review'
	},
	{
		id: 'f8',
		timestamp: '09 MAY',
		type: 'personnel',
		message: 'SPC Baker inprocessed',
		detail: 'Assigned to WPNS — onboarding started'
	}
];

export function availabilityColor(pct: number): string {
	if (pct >= 85) return 'text-success-foreground';
	if (pct >= 70) return 'text-warning-foreground';
	return 'text-destructive';
}

export function availabilityBg(pct: number): string {
	if (pct >= 85) return 'bg-success';
	if (pct >= 70) return 'bg-warning';
	return 'bg-destructive';
}

export function severityColor(severity: AttentionItem['severity']): string {
	const map = { danger: 'text-destructive', warning: 'text-warning-foreground', info: 'text-info-foreground' };
	return map[severity];
}

export function severityBg(severity: AttentionItem['severity']): string {
	const map = {
		danger: 'bg-destructive/10',
		warning: 'bg-warning/10',
		info: 'bg-info/10'
	};
	return map[severity];
}

export function severityDot(severity: AttentionItem['severity']): string {
	const map = {
		danger: 'bg-destructive',
		warning: 'bg-warning',
		info: 'bg-info'
	};
	return map[severity];
}

export function activityIcon(type: ActivityEntry['type']): string {
	const map = {
		personnel: 'P',
		training: 'T',
		duty: 'D',
		onboarding: 'O',
		calendar: 'C',
		eval: 'E'
	};
	return map[type];
}

export function activityColor(type: ActivityEntry['type']): string {
	const map = {
		personnel: 'bg-info/20 text-info-foreground',
		training: 'bg-success/20 text-success-foreground',
		duty: 'bg-amber/20 text-amber-foreground',
		onboarding: 'bg-primary/10 text-foreground',
		calendar: 'bg-muted text-muted-foreground',
		eval: 'bg-destructive/10 text-destructive'
	};
	return map[type];
}
