import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '../training.types';
import { renewalMode, type RenewalMode } from './cellDisplayText';
import { MATRIX_HORIZON_DAYS } from './matrixReadiness';
import { summarizeTrainingApplicability } from './trainingApplicabilitySummary';
import { trainingRequirements } from './trainingBriefing';
import { getTrainingStatus, type TrainingStatusInfo } from './trainingStatus';

export interface RecordSheetItem {
	type: TrainingType;
	record: PersonnelTraining | undefined;
	statusInfo: TrainingStatusInfo;
	renewal: RenewalMode;
	/** Why the type does not apply, for a not-required item. */
	reason: string | null;
}

export type ReadinessSegment = 'ready' | 'expiring' | 'expired' | 'missing';

export interface TrainingRecordSheetModel {
	needsAction: RecordSheetItem[];
	current: RecordSheetItem[];
	notRequired: RecordSheetItem[];
	exempt: RecordSheetItem[];
	/** Needs-action items one click can record: a card-date type needs the date on the card. */
	recordableToday: RecordSheetItem[];
	segments: ReadinessSegment[];
	ready: number;
	toRecord: number;
}

const NEEDS_ACTION_ORDER: Partial<Record<TrainingStatusInfo['status'], number>> = {
	expired: 0,
	'not-completed': 1,
	'warning-orange': 2,
	'warning-yellow': 2
};

const SEGMENT_FOR_STATUS: Partial<Record<TrainingStatusInfo['status'], ReadinessSegment>> = {
	current: 'ready',
	'warning-orange': 'expiring',
	'warning-yellow': 'expiring',
	expired: 'expired',
	'not-completed': 'missing'
};

function daysLeft(item: RecordSheetItem): number {
	return item.statusInfo.daysUntilExpiration ?? 0;
}

/** What one Soldier still owes, in the order a leader works through it, and the readiness bar above it. */
export function buildTrainingRecordSheet(input: {
	person: Personnel;
	types: TrainingType[];
	records: PersonnelTraining[];
	asOf: string;
}): TrainingRecordSheetModel {
	const { person, types, asOf } = input;
	const records = input.records.filter((record) => record.personnelId === person.id);
	const recordFor = new Map(records.map((record) => [record.trainingTypeId, record]));

	const items = types.map((type): RecordSheetItem => {
		const record = recordFor.get(type.id);
		const statusInfo = getTrainingStatus(record, type, person, asOf);
		return {
			type,
			record,
			statusInfo,
			renewal: renewalMode(type),
			reason: statusInfo.status === 'not-required' ? summarizeTrainingApplicability(type) : null
		};
	});
	const withStatus = (...statuses: TrainingStatusInfo['status'][]) =>
		items.filter((item) => statuses.includes(item.statusInfo.status));

	const needsAction = items
		.filter((item) => item.statusInfo.status in NEEDS_ACTION_ORDER)
		.sort(
			(a, b) =>
				NEEDS_ACTION_ORDER[a.statusInfo.status]! - NEEDS_ACTION_ORDER[b.statusInfo.status]! ||
				(NEEDS_ACTION_ORDER[a.statusInfo.status] === 2 ? daysLeft(a) - daysLeft(b) : 0)
		);

	const requirements = trainingRequirements({
		personnel: [person],
		types: types.filter((type) => !type.isOptional),
		records,
		asOf,
		horizonDays: MATRIX_HORIZON_DAYS
	});
	const ready = requirements.filter((requirement) => requirement.readyToday).length;

	return {
		needsAction,
		current: withStatus('current'),
		notRequired: withStatus('not-required'),
		exempt: withStatus('exempt'),
		recordableToday: needsAction.filter((item) => item.renewal !== 'cardDate'),
		segments: requirements.map((requirement) => SEGMENT_FOR_STATUS[requirement.status] ?? 'missing'),
		ready,
		toRecord: requirements.length - ready
	};
}
