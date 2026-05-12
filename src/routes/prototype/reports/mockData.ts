// PROTOTYPE — mock data for training reports redesign. Delete when done.

export type TrainingStatus = 'current' | 'warning-yellow' | 'warning-orange' | 'expired' | 'not-completed';

export interface StatusCounts {
	current: number;
	warningYellow: number;
	warningOrange: number;
	expired: number;
	notCompleted: number;
}

export interface PersonRow {
	id: string;
	name: string;
	rank: string;
	mos: string;
	group: string;
	role: string;
	trainings: Record<string, { status: TrainingStatus; date: string | null }>;
	readiness: number;
}

export interface GroupSummary {
	id: string;
	name: string;
	readiness: number;
	personnel: number;
	expired: number;
	expiringSoon: number;
}

export interface TrainingTypeSummary {
	id: string;
	name: string;
	complianceRate: number;
	expired: number;
	expiringSoon: number;
	total: number;
}

export const trainingTypes: TrainingTypeSummary[] = [
	{ id: 'cpr', name: 'CPR / BLS', complianceRate: 72, expired: 14, expiringSoon: 8, total: 78 },
	{ id: 'weapons', name: 'Weapons Qual', complianceRate: 85, expired: 6, expiringSoon: 5, total: 78 },
	{ id: 'pha', name: 'PHA', complianceRate: 64, expired: 18, expiringSoon: 10, total: 78 },
	{ id: 'cyber', name: 'Cyber Awareness', complianceRate: 91, expired: 3, expiringSoon: 4, total: 78 },
	{ id: 'sharp', name: 'SHARP', complianceRate: 88, expired: 5, expiringSoon: 4, total: 78 },
	{ id: 'sere', name: 'SERE', complianceRate: 58, expired: 22, expiringSoon: 11, total: 78 },
	{ id: 'hazmat', name: 'HAZMAT', complianceRate: 76, expired: 10, expiringSoon: 9, total: 78 },
	{ id: 'driver', name: 'Drivers Training', complianceRate: 82, expired: 7, expiringSoon: 7, total: 78 }
];

export const groups: GroupSummary[] = [
	{ id: 'hq', name: 'HQ Platoon', readiness: 82, personnel: 18, expired: 6, expiringSoon: 4 },
	{ id: '1st', name: '1st Platoon', readiness: 71, personnel: 22, expired: 12, expiringSoon: 8 },
	{ id: '2nd', name: '2nd Platoon', readiness: 68, personnel: 20, expired: 14, expiringSoon: 6 },
	{ id: '3rd', name: '3rd Platoon', readiness: 77, personnel: 18, expired: 8, expiringSoon: 5 }
];

export const statusCounts: StatusCounts = {
	current: 412,
	warningYellow: 48,
	warningOrange: 32,
	expired: 88,
	notCompleted: 44
};

export const overallReadiness = 74;
export const totalPersonnel = 78;

const ranks = ['PV2', 'PFC', 'SPC', 'CPL', 'SGT', 'SSG', 'SFC', '1SG', '2LT', '1LT', 'CPT'];
const mosOptions = ['11B', '68W', '25B', '13F', '91B', '42A'];
const roleOptions = ['Team Leader', 'Squad Leader', 'Platoon Sergeant', 'Medic', 'RTO', 'Driver', 'Gunner'];
const firstNames = [
	'James',
	'Maria',
	'David',
	'Sarah',
	'Michael',
	'Ashley',
	'Robert',
	'Jessica',
	'William',
	'Emily',
	'Carlos',
	'Nguyen',
	'Ahmed',
	'Brianna',
	'Dmitri',
	'Keisha',
	'Juan',
	'Megan',
	'Tyrone',
	'Hannah',
	'Derek',
	'Priya',
	'Tomas',
	'Nicole',
	'Andre'
];
const lastNames = [
	'Rodriguez',
	'Chen',
	'Williams',
	'Martinez',
	'Johnson',
	'Thompson',
	'Davis',
	'Wilson',
	'Anderson',
	'Taylor',
	'Clark',
	'Lewis',
	'Walker',
	'Hall',
	'Young',
	'King',
	'Wright',
	'Lopez',
	'Hill',
	'Scott',
	'Green',
	'Adams',
	'Baker',
	'Nelson',
	'Patel'
];

function randomStatus(): TrainingStatus {
	const r = Math.random();
	if (r < 0.55) return 'current';
	if (r < 0.65) return 'warning-yellow';
	if (r < 0.75) return 'warning-orange';
	if (r < 0.9) return 'expired';
	return 'not-completed';
}

function randomDate(status: TrainingStatus): string | null {
	if (status === 'not-completed') return null;
	const now = new Date();
	const offset =
		status === 'current'
			? Math.floor(Math.random() * 180)
			: status === 'warning-yellow'
				? Math.floor(Math.random() * 60)
				: status === 'warning-orange'
					? Math.floor(Math.random() * 30)
					: -Math.floor(Math.random() * 120);
	const d = new Date(now.getTime() + offset * 86400000);
	return d.toISOString().slice(0, 10);
}

function pick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

export function generatePersonnel(count = 78): PersonRow[] {
	const groupAssignment = groups.flatMap((g) => Array.from({ length: g.personnel }, () => g));
	return Array.from({ length: count }, (_, i) => {
		const trainings: PersonRow['trainings'] = {};
		let current = 0;
		let total = 0;
		for (const tt of trainingTypes) {
			const status = randomStatus();
			trainings[tt.id] = { status, date: randomDate(status) };
			total++;
			if (status === 'current') current++;
		}
		const group = groupAssignment[i] ?? pick(groups);
		return {
			id: `p-${i}`,
			name: `${pick(lastNames)}, ${pick(firstNames)}`,
			rank: pick(ranks),
			mos: pick(mosOptions),
			group: group.name,
			role: pick(roleOptions),
			trainings,
			readiness: Math.round((current / total) * 100)
		};
	});
}

export const personnel: PersonRow[] = generatePersonnel();

export const statusColorMap: Record<TrainingStatus, string> = {
	current: 'bg-success/15 text-success-foreground',
	'warning-yellow': 'bg-warning/15 text-warning-foreground',
	'warning-orange': 'bg-warning/25 text-warning-foreground',
	expired: 'bg-danger/15 text-danger-foreground',
	'not-completed': 'bg-muted text-muted-foreground'
};

export const statusDotMap: Record<TrainingStatus, string> = {
	current: 'bg-success',
	'warning-yellow': 'bg-warning',
	'warning-orange': 'bg-warning',
	expired: 'bg-destructive',
	'not-completed': 'bg-muted-foreground/40'
};

export const statusLabels: Record<TrainingStatus, string> = {
	current: 'Current',
	'warning-yellow': 'Expiring 60d',
	'warning-orange': 'Expiring 30d',
	expired: 'Expired',
	'not-completed': 'Not Done'
};

export function readinessTone(pct: number): string {
	if (pct >= 80) return 'text-success-foreground';
	if (pct >= 60) return 'text-warning-foreground';
	return 'text-destructive';
}

export function readinessBg(pct: number): string {
	if (pct >= 80) return 'bg-success/15';
	if (pct >= 60) return 'bg-warning/15';
	return 'bg-danger/15';
}

export function readinessBarColor(pct: number): string {
	if (pct >= 80) return 'bg-success';
	if (pct >= 60) return 'bg-warning';
	return 'bg-destructive';
}
