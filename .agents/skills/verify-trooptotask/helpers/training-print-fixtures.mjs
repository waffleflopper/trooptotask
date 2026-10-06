import { randomUUID } from 'node:crypto';

const typeNames = [
	'Basic Life Support Provider Certification',
	'Advanced Cardiovascular Life Support',
	'Pediatric Advanced Life Support',
	'Tactical Combat Casualty Care',
	'Combat Lifesaver Sustainment Training',
	'Individual Weapons Qualification',
	'Chemical Biological Radiological Nuclear Defense',
	'Cyber Awareness Challenge',
	'Information Security and Operations Security',
	'Antiterrorism Level One Awareness',
	'Sexual Harassment Assault Response and Prevention',
	'Equal Opportunity and Harassment Prevention',
	'Army Suicide Prevention and Intervention',
	'Privacy Act and Health Information Protection',
	'Bloodborne Pathogens Exposure Prevention',
	'Infection Prevention and Control Practices',
	'Respiratory Protection and Mask Fit Testing',
	'Patient Safety and Medical Error Reporting',
	'Medication Administration Safety',
	'Medical Equipment Operator Competency',
	'Emergency Response and Evacuation Procedures',
	'Unit Movement and Deployment Readiness',
	'Hazardous Materials Handling and Transportation',
	'Clinical Respiratory Therapy Skills Validation'
];

const groupNames = [
	'Command and Administration',
	'Primary Care Treatment Team',
	'Respiratory Therapy Section',
	'Emergency Medical Response',
	'Preventive Medicine and Public Health',
	'Patient Administration and Records',
	'Medical Logistics and Equipment Readiness',
	'Behavioral Health Support',
	'Physical Therapy and Rehabilitation',
	'Laboratory and Diagnostic Services',
	'Pharmacy Operations',
	'Field Medical Support',
	'Education and Clinical Competency Coordination',
	'Specialty Care Referral and Readiness Management'
];

export async function seedTrainingPrint({ client, fixture, tag, ownedState, save }) {
	if (ownedState.seeded.some((item) => item.kind === 'training-print'))
		throw new Error('Clean the existing training-print seed before preparing another cohort.');
	const { ids, dates } = fixture;
	const date = (offset) => {
		const value = new Date(dates.ui + 'T12:00:00Z');
		value.setUTCDate(value.getUTCDate() + offset);
		return value.toISOString().slice(0, 10);
	};
	const groups = groupNames.map((name, index) => ({
		id: randomUUID(),
		organization_id: ids.orgA,
		name: `Print A ${String(index + 1).padStart(2, '0')} ${name} ${tag}`
	}));
	const roles = groupNames.map((name, index) => `Print Role ${String(index + 1).padStart(2, '0')} ${name} ${tag}`);
	const people = groups.flatMap((group, index) =>
		Array.from({ length: 8 }, (_, slot) => ({
			id: randomUUID(),
			organization_id: ids.orgA,
			group_id: group.id,
			first_name: 'Synthetic',
			last_name: `PrintA${tag}${String(index * 8 + slot + 1).padStart(3, '0')}`,
			slug: `print-a-${tag}-${String(index * 8 + slot + 1).padStart(3, '0')}`,
			rank: 'PFC',
			mos: '68V',
			clinic_role: roles[index]
		}))
	);
	const types = typeNames.map((name, index) => ({
		id: randomUUID(),
		organization_id: ids.orgA,
		name: `${name} ${tag}`,
		expiration_date_only: true,
		warning_days_yellow: 60,
		warning_days_orange: 30,
		applies_to_roles: index === 23 ? roles.slice(0, 7) : [],
		is_optional: false,
		sort_order: 100 + index
	}));
	const offsets = [null, null, -20, -5, 10, 30, 120, 365];
	const records = types.flatMap((type, typeIndex) =>
		people.flatMap((person, index) => {
			if (typeIndex === 23 && index >= 56) return [];
			const offset = typeIndex === 0 ? (index < 100 ? null : 365) : offsets[index % 8];
			if (offset === null) return [];
			return [
				{
					id: randomUUID(),
					organization_id: ids.orgA,
					personnel_id: person.id,
					training_type_id: type.id,
					completion_date: date(-400),
					expiration_date: date(offset)
				}
			];
		})
	);
	const views = [
		['Dense', types.map(({ id }) => id)],
		['Short', types.slice(0, 3).map(({ id }) => id)],
		['Empty', []]
	].map(([name, column_ids]) => ({
		id: randomUUID(),
		organization_id: ids.orgA,
		name: `Print A ${name} ${tag}`,
		column_ids,
		created_by: fixture.actors.trainingConfigure.id
	}));
	const batches = [
		['groups', groups],
		['personnel', people],
		['training_types', types],
		['training_views', views],
		['personnel_trainings', records]
	];
	for (const [table, rows] of batches)
		ownedState.seeded.push({ kind: 'training-print', table, organization: 'orgA', tag, ids: rows.map(({ id }) => id) });
	await save(ownedState);
	for (const [table, rows] of batches) {
		for (let offset = 0; offset < rows.length; offset += 100) {
			const result = await client.from(table).insert(rows.slice(offset, offset + 100));
			if (result.error) throw new Error('Owned training-print setup failed: ' + result.error.message);
		}
	}
	return {
		tag,
		today: dates.ui,
		filters: { viewId: views[0].id, rank: 'PFC', mos: ['68V'], horizonDays: 90 },
		views,
		groups,
		roles,
		types,
		expected: {
			soldiers: 112,
			applicable: 2632,
			readyToday: 1272,
			readyAt90Days: 642,
			notRecorded: 730,
			expired: 630,
			lapsing: 630,
			todayPercent: 48,
			horizonPercent: 24,
			drop: 24,
			notReadySoldiers: 104,
			lapsingSoldiers: 28,
			affectedRequirements: 1990,
			firstType: { applicable: 112, readyToday: 12, notRecorded: 100, affected: 100 },
			ordinaryType: { applicable: 112, readyToday: 56, notRecorded: 28, expired: 28, lapsing: 28 },
			targetedType: { applicable: 56, readyToday: 28, notRecorded: 14, expired: 14, lapsing: 14, notApplicable: 56 }
		},
		boundary:
			'Journaled source setup only in the toolkit-owned disposable provider. No original fixture row is changed.'
	};
}

export async function cleanTrainingPrint({ client, fixture, ownedState, save }) {
	for (const item of [...ownedState.seeded].reverse().filter((item) => item.kind === 'training-print')) {
		for (let offset = 0; offset < item.ids.length; offset += 100) {
			const result = await client
				.from(item.table)
				.delete()
				.eq('organization_id', fixture.ids[item.organization])
				.in('id', item.ids.slice(offset, offset + 100));
			if (result.error) throw new Error('Owned training-print cleanup failed: ' + result.error.message);
		}
		ownedState.seeded = ownedState.seeded.filter((candidate) => candidate !== item);
		await save(ownedState);
	}
}
