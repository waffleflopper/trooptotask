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
					training_type_id: ids.trainingRequired,
					sort_order: 2,
					completed: false,
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
