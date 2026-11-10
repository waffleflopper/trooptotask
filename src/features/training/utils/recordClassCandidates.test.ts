import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '../training.types';
import { recordClassCandidates } from './recordClassCandidates';

const AS_OF = '2026-11-01';

function person(id: string, overrides: Partial<Personnel> = {}): Personnel {
	return {
		id,
		rank: 'SGT',
		lastName: id,
		firstName: 'Pat',
		mos: '68W',
		clinicRole: '',
		groupId: 'g1',
		groupName: 'Alpha',
		...overrides
	};
}

const cpr: TrainingType = {
	id: 'cpr',
	name: 'CPR',
	description: null,
	expirationMonths: 12,
	warningDaysYellow: 60,
	warningDaysOrange: 30,
	appliesToRoles: [],
	appliesToMos: [],
	appliesToRanks: [],
	excludedRoles: [],
	excludedMos: [],
	excludedRanks: [],
	color: '#22c55e',
	sortOrder: 0,
	expirationDateOnly: false,
	canBeExempted: true,
	exemptPersonnelIds: ['exempt'],
	isOptional: false,
	archivedAt: null
};

/** A completion of a 12-month type, dated so that it expires on `expires`. */
function record(personnelId: string, expires: string, trainingTypeId = 'cpr'): PersonnelTraining {
	return {
		id: `${personnelId}-${trainingTypeId}`,
		personnelId,
		trainingTypeId,
		completionDate: `${Number(expires.slice(0, 4)) - 1}${expires.slice(4)}`,
		expirationDate: null,
		notes: null,
		certificateUrl: null
	};
}

describe('recordClassCandidates', () => {
	it('checks expired, due soon and missing Soldiers, leaves current ones unchecked and hides exempt ones', () => {
		const people = [
			person('expired'),
			person('orange'),
			person('yellow'),
			person('missing'),
			person('current'),
			person('exempt')
		];
		const trainings = [
			record('expired', '2026-10-27'),
			record('orange', '2026-11-11'),
			record('yellow', '2026-12-21'),
			record('current', '2027-06-01'),
			record('exempt', '2026-10-27')
		];

		expect(
			recordClassCandidates(cpr, people, trainings, AS_OF).map(({ person, statusLabel, checked }) => [
				person.id,
				statusLabel,
				checked
			])
		).toEqual([
			['expired', 'Expired 5d ago', true],
			['orange', '10d left', true],
			['yellow', '50d left', true],
			['missing', 'Not Done', true],
			['current', 'Current', false]
		]);
	});

	it('hides Soldiers the type does not apply to and ignores records of other types', () => {
		const medic = person('medic', { clinicRole: 'Medic' });
		const clerk = person('clerk', { clinicRole: 'Clerk' });
		const forMedics: TrainingType = { ...cpr, appliesToRoles: ['Medic'] };

		const candidates = recordClassCandidates(forMedics, [medic, clerk], [record('medic', '2027-06-01', 'acls')], AS_OF);

		expect(candidates.map(({ person, statusLabel }) => [person.id, statusLabel])).toEqual([['medic', 'Not Done']]);
	});
});
