import { randomUUID } from 'node:crypto';

const expiredAt = '2000-01-01T12:00:00.000Z';
const checked = (result) => {
	if (result.error) throw new Error('Owned Onboarding setup failed: ' + result.error.message);
};

// Record every temporary ID before writing, so interrupted setup is still removable.
export async function seedOnboarding({ client, fixture, kind, tag, ownedState, save }) {
	const recentAt = new Date(Date.now() - 86400000).toISOString();
	const batches = [];
	let packets;
	let progress;
	let people;
	if (kind === 'onboarding-start') {
		people = [
			{
				id: randomUUID(),
				organization_id: fixture.ids.orgA,
				group_id: fixture.ids.groupA,
				rank: 'SPC',
				first_name: 'Synthetic',
				last_name: 'MapStart' + tag,
				slug: 'map-start-' + tag
			}
		];
		packets = [];
		progress = [];
		batches.push(
			['personnel', people],
			[
				'personnel_trainings',
				[
					{
						id: randomUUID(),
						organization_id: fixture.ids.orgA,
						personnel_id: people[0].id,
						training_type_id: fixture.ids.trainingRequired,
						completion_date: '1999-01-01',
						expiration_date: '2000-01-01'
					}
				]
			]
		);
	} else if (kind === 'onboarding-legacy') {
		const person = {
			id: randomUUID(),
			organization_id: fixture.ids.orgA,
			group_id: fixture.ids.groupA,
			rank: 'SPC',
			first_name: 'Synthetic',
			last_name: 'MapLegacy' + tag,
			slug: 'map-legacy-' + tag
		};
		packets = [
			{
				id: randomUUID(),
				organization_id: fixture.ids.orgA,
				personnel_id: person.id,
				template_id: null,
				started_at: fixture.dates.ui,
				status: 'in_progress'
			}
		];
		progress = [
			['Orientation', 'checkbox', true, null, null],
			['Paperwork', 'paperwork', false, ['Submitted', 'Reviewed', 'Filed'], 'Reviewed'],
			['Historic task', 'checkbox', true, null, null]
		].map(([step_name, step_type, completed, stages, current_stage], sort_order) => ({
			id: randomUUID(),
			organization_id: fixture.ids.orgA,
			onboarding_id: packets[0].id,
			template_step_id: null,
			step_name,
			step_type,
			completed,
			stages,
			current_stage,
			sort_order,
			active: true,
			notes: [
				{ text: 'Legacy retained work ' + tag, timestamp: expiredAt, userId: fixture.actors.onboardingConfigure.id }
			]
		}));
		batches.push(['personnel', [person]]);
	} else if (kind === 'onboarding-consumers') {
		people = [
			{
				id: randomUUID(),
				organization_id: fixture.ids.orgA,
				group_id: fixture.ids.groupA,
				rank: 'SPC',
				first_name: 'Synthetic',
				last_name: 'Consumer' + tag,
				slug: 'map-consumer-' + tag
			}
		];
		packets = [
			['alphaActive', 'orgA', people[0].id, 'in_progress'],
			['alphaCompleted', 'orgA', people[0].id, 'completed'],
			['bravoActive', 'orgA', fixture.ids.personB, 'in_progress'],
			['foreignActive', 'orgB', fixture.ids.personForeign, 'in_progress']
		].map(([key, organization, personnel_id, status]) => ({
			id: randomUUID(),
			organization_id: fixture.ids[organization],
			personnel_id,
			template_id: fixture.ids[organization === 'orgA' ? 'onboardingTemplate' : 'onboardingForeignTemplate'],
			started_at: fixture.dates.ui,
			status,
			completed_at: status === 'completed' ? recentAt : null,
			cancelled_at: null,
			key
		}));
		progress = packets.flatMap((packet) => {
			const foreign = packet.key === 'foreignActive';
			const steps = foreign
				? [['Foreign checkbox', 'checkbox', false, true]]
				: [
						['Consumer Orientation', 'checkbox', false, true],
						['Consumer Paperwork', 'paperwork', false, true],
						['Consumer Required Training', 'training', false, true],
						...(packet.key === 'alphaActive' ? [['Removed Training', 'training', true, false]] : [])
					];
			return steps.map(([step_name, step_type, completed, active], sort_order) => ({
				id: randomUUID(),
				organization_id: packet.organization_id,
				onboarding_id: packet.id,
				template_step_id: null,
				step_name,
				step_type,
				training_type_id: step_type === 'training' ? fixture.ids.trainingRequired : null,
				stages: step_type === 'paperwork' ? ['Submitted', 'Reviewed', 'Filed'] : null,
				current_stage: step_type === 'paperwork' ? 'Reviewed' : null,
				sort_order,
				completed,
				active,
				notes: [
					{
						text: 'Consumer retained ' + packet.key + ' ' + step_name + ' ' + tag,
						timestamp: recentAt,
						userId: fixture.actors[foreign ? 'onboardingForeign' : 'onboardingConfigure'].id
					}
				]
			}));
		});
		batches.push(['personnel', people]);
	} else if (kind === 'onboarding-status') {
		const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
		const dateAgo = (days) => daysAgo(days).slice(0, 10);
		// Each active packet pins one List status; the paperwork step's progress time sets its days at stage.
		const examples = [
			['stalled', 'groupA', 20, { completed: false, current_stage: 'Reviewed', changed: 7 }],
			['ready', 'groupA', 10, { completed: true, current_stage: 'Filed', changed: 3 }],
			['onTrack', 'groupB', 9, { completed: false, current_stage: 'Submitted', changed: 6 }],
			['new', 'groupA', 0, { completed: false, current_stage: null, changed: 0 }]
		];
		people = examples.map(([key, group]) => ({
			id: randomUUID(),
			organization_id: fixture.ids.orgA,
			group_id: fixture.ids[group],
			rank: 'SPC',
			first_name: 'Synthetic',
			last_name: 'Status' + key + tag,
			slug: 'map-status-' + key.toLowerCase() + '-' + tag
		}));
		const active = examples.map(([key, _group, started], index) => ({
			id: randomUUID(),
			organization_id: fixture.ids.orgA,
			personnel_id: people[index].id,
			template_id: fixture.ids.onboardingTemplate,
			started_at: dateAgo(started),
			status: 'in_progress',
			completed_at: null,
			cancelled_at: null,
			key
		}));
		// Three finished packets inside the 90-day window give a typical figure of 10 days.
		const finished = [8, 10, 12].map((days, index) => ({
			id: randomUUID(),
			organization_id: fixture.ids.orgA,
			personnel_id: people[index].id,
			template_id: fixture.ids.onboardingTemplate,
			started_at: dateAgo(30),
			status: 'completed',
			completed_at: dateAgo(30 - days),
			cancelled_at: null,
			key: 'finished' + days
		}));
		packets = [...active, ...finished];
		progress = active.flatMap((packet, index) => {
			const paperwork = examples[index][3];
			return [
				{
					step_name: 'Status Orientation ' + tag,
					step_type: 'checkbox',
					completed: packet.key !== 'new',
					stages: null,
					current_stage: null,
					progress_changed_at: daysAgo(examples[index][2])
				},
				{
					step_name: 'Status Finance ' + tag,
					step_type: 'paperwork',
					completed: paperwork.completed,
					stages: ['Submitted', 'Reviewed', 'Filed'],
					current_stage: paperwork.current_stage,
					progress_changed_at: daysAgo(paperwork.changed)
				}
			].map((step, sort_order) => ({
				id: randomUUID(),
				organization_id: fixture.ids.orgA,
				onboarding_id: packet.id,
				template_step_id: null,
				sort_order,
				active: true,
				notes: [],
				...step
			}));
		});
		batches.push(['personnel', people]);
	} else if (kind === 'onboarding-history') {
		const startedAt = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
		const examples = [
			['alpha', 'orgA', 'groupA', 'completed', false],
			['archived', 'orgA', 'groupA', 'cancelled', true],
			['bravo', 'orgA', 'groupB', 'completed', false],
			['foreign', 'orgB', 'groupForeign', 'completed', false]
		];
		people = examples.map(([key, organization, group, _status, archived]) => ({
			id: randomUUID(),
			organization_id: fixture.ids[organization],
			group_id: fixture.ids[group],
			rank: 'SPC',
			first_name: 'Synthetic',
			last_name: 'History' + key + tag,
			slug: 'map-history-' + key + '-' + tag,
			archived_at: archived ? recentAt : null
		}));
		packets = examples.map(([key, organization, _group, status], index) => ({
			id: randomUUID(),
			organization_id: fixture.ids[organization],
			personnel_id: people[index].id,
			template_id: fixture.ids[organization === 'orgA' ? 'onboardingTemplate' : 'onboardingForeignTemplate'],
			started_at: startedAt,
			completed_at: status === 'completed' ? recentAt : null,
			cancelled_at: status === 'cancelled' ? recentAt : null,
			status,
			key
		}));
		progress = packets.flatMap((packet) =>
			[
				['Checkbox', 'checkbox', true, true, null],
				['Paperwork', 'paperwork', false, true, 'Reviewed'],
				['Training', 'training', false, true, null],
				['Removed done', 'checkbox', true, false, null],
				['Removed pending', 'checkbox', false, false, null]
			].map(([label, step_type, completed, active, current_stage], sort_order) => ({
				id: randomUUID(),
				organization_id: packet.organization_id,
				onboarding_id: packet.id,
				template_step_id: null,
				step_name: 'History ' + label + ' ' + packet.key + ' ' + tag,
				step_type,
				training_type_id:
					step_type === 'training'
						? fixture.ids[packet.key === 'foreign' ? 'trainingForeignType' : 'trainingRequired']
						: null,
				stages: step_type === 'paperwork' ? ['Submitted', 'Reviewed', 'Filed'] : null,
				current_stage: packet.key === 'foreign' && step_type === 'paperwork' ? 'Archived review' : current_stage,
				sort_order,
				completed,
				active,
				notes: [
					{
						text: 'History note ' + label + ' ' + packet.key + ' ' + tag,
						timestamp: recentAt,
						userId: fixture.actors[packet.key === 'foreign' ? 'onboardingForeign' : 'onboardingConfigure'].id
					}
				]
			}))
		);
		batches.push(
			['personnel', people],
			[
				'personnel_trainings',
				[
					{
						id: randomUUID(),
						organization_id: fixture.ids.orgA,
						personnel_id: people[0].id,
						training_type_id: fixture.ids.trainingRequired,
						completion_date: fixture.dates.trainingCompleted,
						expiration_date: fixture.dates.trainingExpires
					}
				]
			]
		);
	} else {
		const completedCount = kind === 'onboarding-retention-1001' ? 1001 : 1;
		const examples = [
			...Array.from({ length: completedCount }, (_, index) => [
				'expiredCompleted' + index,
				'orgA',
				'completed',
				expiredAt
			]),
			['expiredCancelled', 'orgA', 'cancelled', expiredAt],
			['recentCompleted', 'orgA', 'completed', recentAt],
			['recentCancelled', 'orgA', 'cancelled', recentAt],
			['nullCompleted', 'orgA', 'completed', null],
			['nullCancelled', 'orgA', 'cancelled', null],
			['active', 'orgA', 'in_progress', null],
			['foreignRecent', 'orgB', 'completed', recentAt]
		];
		packets = examples.map(([key, organization, status, terminalAt]) => ({
			id: randomUUID(),
			organization_id: fixture.ids[organization],
			personnel_id:
				organization === 'orgB'
					? fixture.ids.personForeign
					: status === 'in_progress'
						? fixture.ids.personUnassigned
						: fixture.ids.personA,
			template_id: organization === 'orgB' ? fixture.ids.onboardingForeignTemplate : fixture.ids.onboardingTemplate,
			started_at: '1999-01-01',
			status,
			completed_at: status === 'completed' ? terminalAt : null,
			cancelled_at: status === 'cancelled' ? terminalAt : null,
			key
		}));
		progress = packets.map((packet) => ({
			id: randomUUID(),
			organization_id: packet.organization_id,
			onboarding_id: packet.id,
			template_step_id: null,
			step_name: 'Retention witness ' + packet.key + ' ' + tag,
			step_type: 'checkbox',
			sort_order: 0,
			completed: true,
			active: true,
			notes: [{ text: 'Retained history ' + tag, timestamp: expiredAt, userId: fixture.actors.onboardingConfigure.id }]
		}));
	}
	const publicPackets = packets;
	if (packets.length) batches.push(['personnel_onboardings', packets.map(({ key: _key, ...packet }) => packet)]);
	if (progress.length) batches.push(['onboarding_step_progress', progress]);
	for (const [table, rows] of batches) {
		for (const organization of ['orgA', 'orgB']) {
			const ids = rows.filter((row) => row.organization_id === fixture.ids[organization]).map((row) => row.id);
			if (ids.length) ownedState.seeded.push({ kind, tag, table, organization, ids });
		}
	}
	await save(ownedState);
	for (const [table, rows] of batches) {
		for (let offset = 0; offset < rows.length; offset += 100)
			checked(await client.from(table).insert(rows.slice(offset, offset + 100)));
	}
	return {
		kind,
		tag,
		packets: publicPackets,
		progress,
		...(people ? { people } : {}),
		...(kind === 'onboarding-history' ? { training: batches[1][1] } : {}),
		...(kind === 'onboarding-start'
			? { person: people[0], templateId: fixture.ids.onboardingTemplate, training: batches[1][1] }
			: {}),
		...(kind === 'onboarding-legacy' ? { person: batches[0][1][0] } : {})
	};
}
