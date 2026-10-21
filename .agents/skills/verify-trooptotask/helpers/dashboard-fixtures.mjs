import { randomUUID } from 'node:crypto';

// Source facts for a combined Dashboard run. Expected results belong to its recipe.
export async function seedDashboard({ client, fixture, tag, ownedState, save }) {
	if (ownedState.seeded.some((item) => item.kind === 'dashboard'))
		throw new Error('Clean the existing Dashboard seed before preparing another cohort.');
	const { ids, dates } = fixture;
	const date = (offset) => {
		const value = new Date(dates.ui + 'T12:00:00');
		value.setDate(value.getDate() + offset);
		return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
	};
	const loss = randomUUID();
	const archived = randomUUID();
	const packet = randomUUID();
	const batches = [
		[
			'personnel',
			'orgA',
			[
				{
					id: loss,
					organization_id: ids.orgA,
					group_id: ids.groupA,
					first_name: 'Synthetic',
					last_name: `DashboardLoss${tag}`,
					slug: `dashboard-loss-${tag}`,
					rank: 'SPC',
					mos: '68W',
					clinic_role: 'NCO',
					ets: date(30),
					deros: date(60)
				},
				{
					id: archived,
					organization_id: ids.orgA,
					group_id: ids.groupA,
					first_name: 'Synthetic',
					last_name: `DashboardArchived${tag}`,
					slug: `dashboard-archived-${tag}`,
					rank: 'SPC',
					mos: '68W',
					archived_at: date(-10) + 'T12:00:00Z',
					clinic_role: 'NCO',
					ets: date(10)
				}
			]
		],
		[
			'personnel_trainings',
			'orgA',
			[
				{
					id: randomUUID(),
					organization_id: ids.orgA,
					personnel_id: ids.personA,
					training_type_id: ids.trainingTargeted,
					completion_date: date(-400),
					expiration_date: date(-10)
				},
				{
					id: randomUUID(),
					organization_id: ids.orgA,
					personnel_id: ids.personB,
					training_type_id: ids.trainingRequired,
					completion_date: date(-400),
					expiration_date: date(-5)
				},
				{
					id: randomUUID(),
					organization_id: ids.orgA,
					personnel_id: ids.personUnassigned,
					training_type_id: ids.trainingRequired,
					completion_date: date(-340),
					expiration_date: date(20)
				}
			]
		],
		[
			'daily_assignments',
			'orgA',
			[
				{
					id: randomUUID(),
					organization_id: ids.orgA,
					assignment_type_id: ids.typePersonnel,
					date: dates.ui,
					assignee_id: ids.personA
				},
				{
					id: randomUUID(),
					organization_id: ids.orgA,
					assignment_type_id: ids.typeGroup,
					date: dates.ui,
					assignee_id: ids.groupB
				}
			]
		],
		[
			'personnel_onboardings',
			'orgA',
			[
				{
					id: packet,
					organization_id: ids.orgA,
					personnel_id: ids.personA,
					template_id: ids.onboardingTemplate,
					started_at: dates.ui,
					status: 'in_progress'
				}
			]
		],
		[
			'onboarding_step_progress',
			'orgA',
			[
				{
					id: randomUUID(),
					organization_id: ids.orgA,
					onboarding_id: packet,
					template_step_id: ids.onboardingCheckbox,
					step_name: 'Dashboard Orientation',
					step_type: 'checkbox',
					sort_order: 0,
					completed: true,
					active: true
				},
				{
					id: randomUUID(),
					organization_id: ids.orgA,
					onboarding_id: packet,
					template_step_id: ids.onboardingPaperwork,
					step_name: 'Dashboard Paperwork',
					step_type: 'paperwork',
					sort_order: 1,
					stages: ['Submitted', 'Reviewed', 'Filed'],
					completed: false,
					active: true
				},
				{
					id: randomUUID(),
					organization_id: ids.orgA,
					onboarding_id: packet,
					template_step_id: ids.onboardingTraining,
					step_name: 'Dashboard Training',
					step_type: 'training',
					training_type_id: ids.trainingTargeted,
					sort_order: 2,
					completed: true,
					active: true
				},
				{
					id: randomUUID(),
					organization_id: ids.orgA,
					onboarding_id: packet,
					template_step_id: null,
					step_name: 'Dashboard Retired Step',
					step_type: 'checkbox',
					sort_order: 3,
					completed: true,
					active: false
				}
			]
		],
		[
			'rating_scheme_entries',
			'orgA',
			[
				...[
					[ids.personA, -5, 'active'],
					[ids.personB, 20, 'active'],
					[ids.personUnassigned, 45, 'active'],
					[loss, 90, 'active'],
					[archived, -3, 'active'],
					[ids.personA, -10, 'completed']
				].map(([person, offset, status]) => ({
					id: randomUUID(),
					organization_id: ids.orgA,
					rated_person_id: person,
					eval_type: 'NCOER',
					rater_name: 'Synthetic Rater',
					senior_rater_name: 'Synthetic Senior Rater',
					rating_period_start: date(-365),
					rating_period_end: date(offset),
					status
				}))
			]
		],
		[
			'rating_scheme_entries',
			'orgB',
			[
				{
					id: randomUUID(),
					organization_id: ids.orgB,
					rated_person_id: ids.personForeign,
					eval_type: 'NCOER',
					rater_name: 'Synthetic Foreign Rater',
					senior_rater_name: 'Synthetic Foreign Senior Rater',
					rating_period_start: date(-365),
					rating_period_end: date(-1),
					status: 'active'
				}
			]
		]
	];
	for (const [table, organization, rows] of batches)
		ownedState.seeded.push({ kind: 'dashboard', table, organization, tag, ids: rows.map(({ id }) => id) });
	await save(ownedState);
	for (const [table, , rows] of batches) {
		const result = await client.from(table).insert(rows);
		if (result.error) throw new Error('Owned Dashboard setup failed: ' + result.error.message);
	}
	return {
		tag,
		today: dates.ui,
		loss,
		archived,
		packet,
		batches: batches.map(([table, organization, rows]) => ({ table, organization, rows })),
		boundary: 'Privileged disposable setup; native UI and ordinary authorization observations remain separate.'
	};
}

export async function seedDashboardCurrency({ client, fixture, tag, ownedState, save }) {
	if (ownedState.seeded.some((item) => item.kind === 'dashboard-currency'))
		throw new Error('Clean the existing Dashboard currency seed before preparing another cohort.');
	const loss = ownedState.seeded.find((item) => item.kind === 'dashboard' && item.table === 'personnel')?.ids[0];
	if (!loss) throw new Error('Prepare the combined Dashboard seed first.');
	const { ids, dates } = fixture;
	const date = (offset) => {
		const value = new Date(dates.ui + 'T12:00:00');
		value.setDate(value.getDate() + offset);
		return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
	};
	const types = Array.from({ length: 12 }, (_, index) => ({
		id: randomUUID(),
		organization_id: ids.orgA,
		name: `Dashboard Currency ${String(index + 1).padStart(2, '0')} ${tag}`,
		expiration_date_only: true,
		warning_days_yellow: 60,
		warning_days_orange: 30,
		sort_order: 100 + index
	}));
	const yellowType = {
		id: randomUUID(),
		organization_id: ids.orgB,
		name: `Dashboard Yellow ${tag}`,
		expiration_date_only: true,
		warning_days_yellow: 60,
		warning_days_orange: 30,
		sort_order: 100
	};
	const completion = (organizationId, personnelId, trainingTypeId, offset) => ({
		id: randomUUID(),
		organization_id: organizationId,
		personnel_id: personnelId,
		training_type_id: trainingTypeId,
		completion_date: date(-400),
		expiration_date: date(offset)
	});
	const batches = [
		['training_types', 'orgA', types],
		[
			'personnel_trainings',
			'orgA',
			[
				...types.map((type) => completion(ids.orgA, ids.personA, type.id, -20)),
				...types.slice(0, 11).map((type) => completion(ids.orgA, ids.personB, type.id, -20)),
				completion(ids.orgA, loss, types[0].id, 45)
			]
		],
		['training_types', 'orgB', [yellowType]],
		['personnel_trainings', 'orgB', [completion(ids.orgB, ids.personForeign, yellowType.id, 45)]]
	];
	for (const [table, organization, rows] of batches)
		ownedState.seeded.push({ kind: 'dashboard-currency', table, organization, tag, ids: rows.map(({ id }) => id) });
	await save(ownedState);
	for (const [table, , rows] of batches) {
		const result = await client.from(table).insert(rows);
		if (result.error) throw new Error('Owned Dashboard currency setup failed: ' + result.error.message);
	}
	return {
		tag,
		today: dates.ui,
		batches: batches.map(([table, organization, rows]) => ({ table, organization, rows })),
		boundary: 'Privileged disposable setup; native UI and ordinary authorization observations remain separate.'
	};
}

/** Seven Alpha People out today and returning within a week, four with an ETS, so each Overview list passes its row limit. */
export async function seedDashboardOverflow({ client, fixture, tag, ownedState, save }) {
	if (ownedState.seeded.some((item) => item.kind === 'dashboard-overflow'))
		throw new Error('Clean the existing Dashboard overflow seed before preparing another cohort.');
	const { ids, dates } = fixture;
	const date = (offset) => {
		const value = new Date(dates.ui + 'T12:00:00');
		value.setDate(value.getDate() + offset);
		return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
	};
	const people = Array.from({ length: 7 }, (_, index) => {
		const number = String(index + 1).padStart(2, '0');
		return {
			id: randomUUID(),
			organization_id: ids.orgA,
			group_id: ids.groupA,
			first_name: 'Synthetic',
			last_name: `DashboardOverflow${number}${tag}`,
			slug: `dashboard-overflow-${number}-${tag}`,
			rank: 'SPC',
			mos: '68W',
			clinic_role: 'NCO',
			...(index < 4 ? { ets: date(20 + index * 5) } : {})
		};
	});
	const entries = people.map((person) => ({
		id: randomUUID(),
		organization_id: ids.orgA,
		personnel_id: person.id,
		status_type_id: ids.statusLeave,
		start_date: dates.ui,
		end_date: date(3),
		note: `Dashboard overflow ${tag}`
	}));
	const batches = [
		['personnel', 'orgA', people],
		['availability_entries', 'orgA', entries]
	];
	for (const [table, organization, rows] of batches)
		ownedState.seeded.push({ kind: 'dashboard-overflow', table, organization, tag, ids: rows.map(({ id }) => id) });
	await save(ownedState);
	for (const [table, , rows] of batches) {
		const result = await client.from(table).insert(rows);
		if (result.error) throw new Error('Owned Dashboard overflow setup failed: ' + result.error.message);
	}
	return {
		tag,
		today: dates.ui,
		people: people.map(({ id, last_name, ets }) => ({ id, lastName: last_name, ets: ets ?? null })),
		expected:
			'On the ordinary fixture as dashboardView, Out Today lists eight People (seven seeded plus Baker), Upcoming Changes ten rows (seven returns plus Baker three) and Upcoming Losses four People with ETS in 20, 25, 30 and 35 days. The three expand buttons read "+2 more", "+4 more" and "+1 more". Other seeds add rows and change these counts.',
		boundary: 'Privileged disposable setup; native UI and ordinary authorization observations remain separate.'
	};
}
