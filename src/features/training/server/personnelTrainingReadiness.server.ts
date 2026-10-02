import type { Personnel } from '$features/personnel/contracts';
import { formatDate, parseDate } from '$lib/utils/dates';
import { isTrainingApplicable, type TrainingType } from '../contracts';
import { listTrainingTypes } from './trainingCatalogRead.server';

const DAY_MS = 24 * 60 * 60 * 1000;

interface TrainingReadinessLane {
	label: 'Training';
	value: string;
	detail: string;
	tone: 'good' | 'watch' | 'bad';
}

interface TrainingReadinessInput {
	store: Parameters<typeof listTrainingTypes>[0];
	orgId: string;
	personnelId: string;
	asOf?: string | Date;
	/** Delivery supplies a Personnel- and Group-authorized Person under Training view-records policy. */
	loadAuthorizedPerson: () => Promise<Personnel>;
}

function asOfDate(value?: string | Date): Date {
	if (!value) return parseDate(formatDate(new Date()));
	return typeof value === 'string' ? parseDate(value) : parseDate(formatDate(value));
}

function daysBetween(from: Date, to: Date): number {
	return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function requiredForPerson(type: TrainingType, person: Personnel): boolean {
	if (type.canBeExempted && type.exemptPersonnelIds.includes(person.id)) return false;
	return isTrainingApplicable(type, person);
}

function issueForType(type: TrainingType, expirationDate: string | null | undefined, today: Date) {
	if (expirationDate === undefined) {
		return { name: type.name, expired: true, label: `${type.name} not completed` };
	}
	if (!expirationDate) return null;

	const days = daysBetween(today, parseDate(expirationDate));
	if (days > type.warningDaysYellow) return null;
	const label =
		days < 0
			? `${type.name} expired ${Math.abs(days)}d ago`
			: days === 0
				? `${type.name} due today`
				: `${type.name} ${days}d left`;
	return { name: type.name, expired: days < 0, label };
}

/** Training computes the lane; delivery supplies the existing Person/Group authorization. */
export async function loadTrainingReadinessLane({
	store,
	orgId,
	personnelId,
	asOf,
	loadAuthorizedPerson
}: TrainingReadinessInput): Promise<TrainingReadinessLane> {
	const person = await loadAuthorizedPerson();
	const today = asOfDate(asOf);
	const [types, trainingRows] = await Promise.all([
		listTrainingTypes(store, orgId),
		store.findMany<{ training_type_id: string; expiration_date: string | null }>(
			'personnel_trainings',
			orgId,
			{ personnel_id: personnelId },
			{ select: 'training_type_id, expiration_date' }
		)
	]);
	const expirationByType = new Map(trainingRows.map((row) => [row.training_type_id, row.expiration_date]));
	const issues = types
		.filter((type) => requiredForPerson(type, person))
		.map((type) => issueForType(type, expirationByType.get(type.id), today))
		.filter((issue): issue is { name: string; expired: boolean; label: string } => Boolean(issue));

	if (issues.length === 0) {
		return {
			label: 'Training',
			value: 'Current',
			detail: 'No due or overdue Training requirements.',
			tone: 'good'
		};
	}

	const labels = issues.slice(0, 2).map((issue) => issue.label);
	return {
		label: 'Training',
		value: `${issues.length} due`,
		detail: labels.length > 0 ? `${labels.join('. ')}.` : 'Training requirements need attention.',
		tone: issues.some((issue) => issue.expired) ? 'bad' : 'watch'
	};
}
