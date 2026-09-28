import { randomUUID } from 'node:crypto';
import { checked } from './fixtures.mjs';
import { Blocked, sleep } from './core.mjs';

const name = (prefix) => `${prefix} ${randomUUID().slice(0, 8)}`;
const orgPath = (fixture, org = 'orgA') => `/org/${fixture.ids[org]}`;
const denied = (status) => status === 403 || status === 404;

function parseResponse(response) {
	try {
		return { ...response, data: JSON.parse(response.body) };
	} catch {
		return { ...response, data: null };
	}
}

function inclusiveOverlapDays(start, end, rangeStart, rangeEnd) {
	const from = Math.max(Date.parse(`${start}T00:00:00Z`), Date.parse(`${rangeStart}T00:00:00Z`));
	const through = Math.min(Date.parse(`${end}T00:00:00Z`), Date.parse(`${rangeEnd}T00:00:00Z`));
	return Math.max(0, Math.floor((through - from) / 86_400_000) + 1);
}

function expectedFederalHolidays(year) {
	const date = (month, day) => new Date(Date.UTC(year, month - 1, day));
	const iso = (value) => value.toISOString().slice(0, 10);
	const observed = (value) => {
		const weekday = value.getUTCDay();
		if (weekday === 0) value.setUTCDate(value.getUTCDate() + 1);
		if (weekday === 6) value.setUTCDate(value.getUTCDate() - 1);
		return iso(value);
	};
	const nth = (month, weekday, ordinal) => {
		const first = date(month, 1);
		return iso(date(month, 1 + ((weekday - first.getUTCDay() + 7) % 7) + 7 * (ordinal - 1)));
	};
	const last = (month, weekday) => {
		const end = date(month + 1, 0);
		return iso(date(month, end.getUTCDate() - ((end.getUTCDay() - weekday + 7) % 7)));
	};
	return [
		[observed(date(1, 1)), "New Year's Day"],
		[nth(1, 1, 3), 'Martin Luther King Jr. Day'],
		[nth(2, 1, 3), 'Presidents Day'],
		[last(5, 1), 'Memorial Day'],
		[observed(date(6, 19)), 'Juneteenth'],
		[observed(date(7, 4)), 'Independence Day'],
		[nth(9, 1, 1), 'Labor Day'],
		[nth(10, 1, 2), 'Columbus Day'],
		[observed(date(11, 11)), 'Veterans Day'],
		[nth(11, 4, 4), 'Thanksgiving Day'],
		[observed(date(12, 25)), 'Christmas Day']
	];
}

function harness(drive, service, fixture, observations) {
	const check = (condition, expected, actual = undefined) => {
		observations.push({ expected, observed: !!condition, ...(actual === undefined ? {} : { actual }) });
	};
	const rows = async (table, org = 'orgA', columns = '*') =>
		checked(await service.from(table).select(columns).eq('organization_id', fixture.ids[org]));
	const row = async (table, id, org = 'orgA') => (await rows(table, org)).find((item) => item.id === id);
	const request = async (method, path, body) => {
		for (let attempt = 0; attempt < 3; attempt++) {
			const response = parseResponse(await drive.request(method, path, body));
			if (response.status !== 429) return response;
			const retrySeconds = Number(response.retryAfter);
			if (!Number.isFinite(retrySeconds) || retrySeconds < 1 || retrySeconds > 61)
				throw new Blocked(
					'RATE_LIMIT',
					`Calendar request received 429 with unusable Retry-After: ${response.retryAfter}.`
				);
			await sleep(retrySeconds * 1000 + 250);
		}
		throw new Blocked('RATE_LIMIT', 'Calendar request remained rate-limited after ordinary Retry-After pacing.');
	};
	const waitRow = async (table, predicate, org = 'orgA') => {
		for (let attempt = 0; attempt < 40; attempt++) {
			const match = (await rows(table, org)).find(predicate);
			if (match) return match;
			await sleep(100);
		}
		return null;
	};
	const login = async (role, path = 'calendar', readyText = ['Calendar', 'Access restricted']) =>
		drive.login(role, { path, readyText });
	const open = async (path, readyText) => drive.navigate(path, readyText);
	const reload = async () => drive.reload();
	const clickButton = async (label) => drive.tool('click', { uid: await drive.uid('button', label) });
	const fill = async (label, value) => drive.tool('fill', { uid: await drive.uid('textbox', label), value });
	const rowAction = async (label, rowText) => {
		const result = await drive.evaluate(`() => {
			const matches = [...document.querySelectorAll('button[aria-label=${JSON.stringify(label)}]')]
				.filter(button => button.parentElement?.parentElement?.textContent?.includes(${JSON.stringify(rowText)}));
			if (matches.length === 1) matches[0].click();
			return { matches: matches.length };
		}`);
		if (result.matches !== 1) throw new Blocked('LOCATOR', `Expected one ${label} action for ${rowText}.`);
	};
	const section = async (label) => {
		let matches = [];
		for (let attempt = 0; attempt < 40; attempt++) {
			const source = await drive.snapshot();
			matches = source
				.split('\n')
				.filter((line) => /uid=/.test(line) && line.includes('button') && line.includes(label));
			if (matches.length === 1) break;
			await sleep(100);
		}
		if (matches.length !== 1)
			throw new Blocked('LOCATOR', `Expected one Calendar settings section ${label}; found ${matches.length}.`);
		await drive.tool('click', { uid: matches[0].match(/uid=([^\s]+)/)?.[1] });
	};
	const setInput = async (selector, value) => {
		const result = await drive.evaluate(`() => {
			const element = document.querySelector(${JSON.stringify(selector)});
			if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return { found: false };
			const setter = Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
			setter.call(element, ${JSON.stringify(value)});
			element.dispatchEvent(new Event('input', { bubbles: true }));
			element.dispatchEvent(new Event('change', { bubbles: true }));
			return { found: true, value: element.value };
		}`);
		if (!result.found) throw new Blocked('LOCATOR', `No field ${selector} in current Calendar page.`);
	};
	const selectModalStatus = async (label) => {
		const selected = await drive.evaluate(`() => document.querySelector('#statusType')?.textContent?.trim()`);
		if (selected === label) return;
		await drive.tool('click', { uid: await drive.uid('button', 'Status Type *') });
		const options = await drive.evaluate(`() => {
			const items = [...document.querySelectorAll('[role="option"]')];
			return items.map(item => ({ label: item.textContent?.trim(), highlighted: item.hasAttribute('data-highlighted'), selected: item.getAttribute('aria-selected') === 'true' }));
		}`);
		const target = options.findIndex((option) => option.label === label);
		let from = options.findIndex((option) => option.highlighted);
		if (from < 0) from = options.findIndex((option) => option.selected);
		if (target < 0 || from < 0)
			throw new Blocked('LOCATOR', `Could not locate Calendar status ${label}: ${JSON.stringify(options)}.`);
		const step = target < from ? 'ArrowUp' : 'ArrowDown';
		for (let index = 0; index < Math.abs(target - from); index++) await drive.tool('press_key', { key: step });
		await drive.tool('press_key', { key: 'Enter' });
		const after = await drive.evaluate(`() => document.querySelector('#statusType')?.textContent?.trim()`);
		if (after !== label)
			throw new Blocked('LOCATOR', `Calendar status selection remained ${after}; expected ${label}.`);
	};
	const personCell = async (personName, day) => {
		const result = await drive.evaluate(`() => {
			const matches = [...document.querySelectorAll('.personnel-row')].filter(row => row.querySelector('.personnel-info')?.textContent?.includes(${JSON.stringify(personName)}));
			const cells = matches[0]?.querySelectorAll('[data-slot="date-cell"]');
			const cell = cells?.[${day - 1}];
			if (matches.length === 1 && cell) cell.click();
			return { rows: matches.length, cells: cells?.length ?? 0, clicked: !!cell };
		}`);
		if (result.rows !== 1 || !result.clicked)
			throw new Blocked('LOCATOR', `No ${personName} Calendar cell for day ${day}.`);
	};
	return {
		check,
		rows,
		row,
		request,
		waitRow,
		login,
		open,
		reload,
		clickButton,
		fill,
		rowAction,
		section,
		setInput,
		selectModalStatus,
		personCell
	};
}

async function checkAvailabilityScope(ctx) {
	const { fixture: f, h, service } = ctx;
	const { check, request, login, rows } = h;
	const { ids, dates } = f;
	const range = (org) => `${orgPath(f, org)}/api/calendar-range?rangeStart=${dates.start}&rangeEnd=${dates.end}`;
	const allowedIds = [ids.availabilityAlpha, ids.availabilityBravo, ids.availabilityUnassigned];
	for (const [role, expected] of [
		['calendarLane', allowedIds],
		['calendarScoped', [ids.availabilityAlpha]],
		['calendarEmpty', []]
	]) {
		await login(role);
		const response = await request('GET', range('orgA'));
		const body = response.body;
		check(
			response.status === 200 &&
				expected.every((id) => body.includes(id)) &&
				[...allowedIds, ids.availabilityForeign]
					.filter((id) => !expected.includes(id))
					.every((id) => !body.includes(id)),
			`${role} sees exactly its Calendar availability scope, including unassigned only for Organization authority`,
			{
				status: response.status,
				expectedIds: expected,
				seenIds: [...allowedIds, ids.availabilityForeign].filter((id) => body.includes(id))
			}
		);
		check(
			!body.includes('Foreign Private Status') && !body.includes(ids.personForeign),
			`${role} receives no foreign catalog or Person data`
		);
	}
	const attempted = [];
	for (const [role, person, targetOrg] of [
		['calendarView', 'personA', 'orgA'],
		['manager', 'personA', 'orgA'],
		['calendarScoped', 'personB', 'orgA'],
		['calendarScoped', 'personUnassigned', 'orgA'],
		['calendarLane', 'personForeign', 'orgB']
	]) {
		await login(
			role,
			role === 'manager' ? 'personnel' : 'calendar',
			role === 'manager' ? ['Able, Synthetic'] : ['Calendar', 'Access restricted']
		);
		const marker = name('Denied calendar');
		const payload = {
			personnelId: ids[person],
			statusTypeId: targetOrg === 'orgB' ? ids.statusForeign : ids.statusLeave,
			startDate: dates.start,
			endDate: dates.start,
			note: marker
		};
		const single = await request('POST', `${orgPath(f, targetOrg)}/api/availability`, payload);
		const batch = await request('POST', `${orgPath(f, targetOrg)}/api/availability/batch`, { records: [payload] });
		attempted.push(marker);
		check(
			denied(single.status) && denied(batch.status),
			`${role} cannot write ${person} via single or batch availability`,
			{ single: single.status, batch: batch.status }
		);
	}
	await login('calendarOperate');
	const foreignStatusMarkers = [name('Foreign status single'), name('Foreign status batch')];
	const foreignStatusInput = (note) => ({
		personnelId: ids.personA,
		statusTypeId: ids.statusForeign,
		startDate: dates.start,
		endDate: dates.start,
		note
	});
	const foreignStatusSingle = await request(
		'POST',
		`${orgPath(f)}/api/availability`,
		foreignStatusInput(foreignStatusMarkers[0])
	);
	const foreignStatusBatch = await request('POST', `${orgPath(f)}/api/availability/batch`, {
		records: [foreignStatusInput(foreignStatusMarkers[1])]
	});
	const leakedForeignStatuses = (await rows('availability_entries')).filter((entry) =>
		foreignStatusMarkers.includes(entry.note)
	);
	check(
		denied(foreignStatusSingle.status) && denied(foreignStatusBatch.status) && leakedForeignStatuses.length === 0,
		'Same-Organization Person cannot save a foreign-Organization status through single or batch writes',
		{
			single: foreignStatusSingle.status,
			batch: foreignStatusBatch.status,
			saved: leakedForeignStatuses.length
		}
	);
	if (leakedForeignStatuses.length)
		checked(
			await service
				.from('availability_entries')
				.delete()
				.eq('organization_id', ids.orgA)
				.in('note', foreignStatusMarkers)
		);
	const saved = [...(await rows('availability_entries', 'orgA')), ...(await rows('availability_entries', 'orgB'))];
	check(
		attempted.every((marker) => !saved.some((entry) => entry.note === marker)),
		'Denied single and batch requests save no rows'
	);
	await login('calendarLane');
	const foreignRead = await request('GET', range('orgB'));
	check(
		denied(foreignRead.status) && !foreignRead.body.includes(ids.availabilityForeign),
		'Foreign Organization Calendar range is denied without disclosing saved IDs',
		{ status: foreignRead.status }
	);
}

async function checkStatusTypeLifecycle(ctx) {
	const { fixture: f, drive, h } = ctx;
	const { check, login, clickButton, fill, setInput, section, rowAction, waitRow, row, rows, request } = h;
	const freshName = name('Verification New Status');
	const before = await row('status_types', f.ids.statusLeave);
	const retiringStatus = await row('status_types', f.ids.statusDelete);
	const retiringAvailability = await row('availability_entries', f.ids.availabilityDelete);
	if (!before || !retiringStatus || !retiringAvailability)
		throw new Blocked('FIXTURE', 'Calendar status lifecycle requires its seeded status and linked availability rows.');
	try {
		await login('calendarConfigure', 'calendar/settings', ['Calendar Settings']);
		await section('Status Types');
		await clickButton('Add new');
		await fill('Status name', freshName);
		await clickButton('Add Status Type');
		const created = await waitRow('status_types', (item) => item.name === freshName);
		check(!!created && created.organization_id === f.ids.orgA, 'Settings add creates one Organization A status', {
			id: created?.id
		});
		await h.reload();
		check((await drive.snapshot()).includes(freshName), 'Created status remains in settings after reload');
		await rowAction('Edit status type', 'Verification Leave');
		await fill('Status name', 'Verification Leave Edited');
		await setInput('#edit-status-bg', '#15803d');
		await setInput('#edit-status-text', '#fefce8');
		await clickButton('Save Changes');
		const edited = await waitRow(
			'status_types',
			(item) => item.id === f.ids.statusLeave && item.name === 'Verification Leave Edited'
		);
		const referenced = await row('availability_entries', f.ids.availabilityAlpha);
		check(
			!!edited &&
				edited.id === before?.id &&
				edited.sort_order === 11 &&
				edited.color === '#15803d' &&
				edited.text_color === '#fefce8' &&
				referenced?.status_type_id === f.ids.statusLeave,
			'Edit preserves status identity, sort order and linked availability while saving name and colors',
			{ edited, linkedId: referenced?.id }
		);
		await h.reload();
		check(
			(await drive.snapshot()).includes('Verification Leave Edited'),
			'Reloaded settings reflects edited status label'
		);
		const apiOrder = await request('PUT', `${orgPath(f)}/api/status-types`, { id: f.ids.statusLeave, sortOrder: 11 });
		check(
			apiOrder.status === 200 && (await row('status_types', f.ids.statusLeave))?.sort_order === 11,
			'API/entity boundary preserves explicit status sort order',
			{ status: apiOrder.status }
		);
		const priorAuditIds = new Set(
			checked(await ctx.service.from('audit_logs').select('id').eq('org_id', f.ids.orgA)).map((event) => event.id)
		);
		const priorNotificationIds = new Set((await rows('notifications')).map((item) => item.id));
		await rowAction('Delete status type', 'Verification Retiring Status');
		const confirm = await drive.snapshot();
		check(
			confirm.includes('All schedule entries using this status will also be removed'),
			'Deletion warns about affected availability'
		);
		await clickButton('Delete');
		for (let attempt = 0; attempt < 30 && (await row('status_types', f.ids.statusDelete)); attempt++) await sleep(100);
		check(
			!(await row('status_types', f.ids.statusDelete)) &&
				!(await row('availability_entries', f.ids.availabilityDelete)) &&
				!!(await row('availability_entries', f.ids.availabilityHistorical)),
			'Confirmed status deletion removes only its linked entries and retains unrelated historical rows'
		);
		const audit = checked(
			await ctx.service.from('audit_logs').select('id,action,resource_id').eq('org_id', f.ids.orgA)
		);
		const notifications = await rows('notifications');
		check(
			audit.some(
				(event) =>
					!priorAuditIds.has(event.id) &&
					event.action === 'status_type.deleted' &&
					event.resource_id === f.ids.statusDelete
			) &&
				notifications.some(
					(item) =>
						!priorNotificationIds.has(item.id) &&
						item.type === 'config_type_deleted' &&
						item.title === 'Status Type Deleted'
				),
			'Status deletion records audit and administrator notification effects'
		);
		await login('calendarView');
		const rejectedName = name('Denied update');
		const deniedUpdate = await request('PUT', `${orgPath(f)}/api/status-types`, {
			id: f.ids.statusLeave,
			name: rejectedName
		});
		check(
			denied(deniedUpdate.status) &&
				(await row('status_types', f.ids.statusLeave))?.name === 'Verification Leave Edited',
			'Viewer update is denied without a misleading persisted change',
			{ status: deniedUpdate.status }
		);
	} finally {
		// The deletion assertion needs the real cascade. Put both seeded rows back
		// afterward so a retry in this owned session can prove it again.
		checked(await ctx.service.from('status_types').upsert(retiringStatus));
		checked(await ctx.service.from('availability_entries').upsert(retiringAvailability));
		checked(
			await ctx.service
				.from('status_types')
				.update({ name: before.name, color: before.color, text_color: before.text_color })
				.eq('id', f.ids.statusLeave)
		);
		checked(await ctx.service.from('status_types').delete().eq('organization_id', f.ids.orgA).eq('name', freshName));
	}
}

async function checkAssignmentTypeLifecycle(ctx) {
	const { fixture: f, drive, h } = ctx;
	const { check, login, clickButton, fill, setInput, section, rowAction, waitRow, row, rows, request } = h;
	const personName = name('Verification New Person Duty');
	const groupName = name('Verification New Group Duty');
	const before = await row('assignment_types', f.ids.typePersonnel);
	const retiringType = await row('assignment_types', f.ids.typeDelete);
	const retiringAssignment = await row('daily_assignments', f.ids.assignmentDelete);
	if (!before || !retiringType || !retiringAssignment)
		throw new Blocked('FIXTURE', 'Calendar assignment lifecycle requires its seeded types and linked assignment.');
	try {
		await login('calendarConfigure', 'calendar/settings', ['Calendar Settings']);
		await section('Assignment Types');
		await clickButton('Add new');
		await fill('Full name', personName);
		await fill('Short code', 'VPN');
		await clickButton('Add Assignment Type');
		const createdPerson = await waitRow('assignment_types', (item) => item.name === personName);
		check(
			!!createdPerson && createdPerson.assign_to === 'personnel',
			'Settings creates a Person-targeted assignment type',
			{ id: createdPerson?.id }
		);
		await clickButton('Add new');
		await fill('Full name', groupName);
		await fill('Short code', 'VGN');
		await setInput('#add-assign-to', 'group');
		await clickButton('Add Assignment Type');
		const createdGroup = await waitRow('assignment_types', (item) => item.name === groupName);
		check(!!createdGroup && createdGroup.assign_to === 'group', 'Settings creates a Group-targeted assignment type', {
			id: createdGroup?.id
		});
		await rowAction('Edit assignment type', 'Verification Staff Duty');
		await fill('Full name', 'Verification Staff Duty Edited');
		await fill('Short code', 'VSE');
		await setInput('#edit-assign-color', '#15803d');
		await clickButton('Save Changes');
		const edited = await waitRow(
			'assignment_types',
			(item) => item.id === f.ids.typePersonnel && item.name === 'Verification Staff Duty Edited'
		);
		check(
			!!edited &&
				edited.id === before?.id &&
				edited.short_name === 'VSE' &&
				edited.color === '#15803d' &&
				edited.sort_order === 11 &&
				edited.exempt_personnel_ids?.includes(f.ids.personB) &&
				(await row('daily_assignments', f.ids.assignmentPersonnel))?.assignment_type_id === f.ids.typePersonnel,
			'Edit retains assignment type identity, order, exemptions and saved assignment reference',
			{ edited }
		);
		await h.reload();
		await section('Assignment Types');
		const reloaded = await drive.snapshot();
		check(
			reloaded.includes('Verification Staff Duty Edited') && !reloaded.includes('Verification Archived Duty'),
			'Reloaded settings shows edited active type and excludes archived type from editable choices'
		);
		const priorNotificationIds = new Set((await rows('notifications')).map((item) => item.id));
		await rowAction('Delete assignment type', 'Verification Retiring Duty');
		check(
			(await drive.snapshot()).includes('All assignments using this type will also be removed'),
			'Deletion warns about affected assignments'
		);
		await clickButton('Delete');
		for (let attempt = 0; attempt < 30 && (await row('assignment_types', f.ids.typeDelete)); attempt++)
			await sleep(100);
		check(
			!(await row('assignment_types', f.ids.typeDelete)) &&
				!(await row('daily_assignments', f.ids.assignmentDelete)) &&
				!!(await row('daily_assignments', f.ids.assignmentPersonnel)) &&
				!!(await row('assignment_types', f.ids.typeArchived)) &&
				!!(await row('daily_assignments', f.ids.assignmentArchived)),
			'Confirmed ordinary type deletion removes only linked assignments and retains unrelated and archived history'
		);
		const archivedRange = await request(
			'GET',
			`${orgPath(f)}/api/calendar-range?rangeStart=${f.dates.middle}&rangeEnd=${f.dates.middle}`
		);
		const archivedBootstrap = await request('GET', `${orgPath(f)}/calendar/__data.json`);
		check(
			archivedRange.status === 200 &&
				archivedRange.body.includes(f.ids.assignmentArchived) &&
				archivedBootstrap.status === 200 &&
				archivedBootstrap.body.includes(f.ids.typeArchived) &&
				archivedBootstrap.body.includes('Verification Archived Duty') &&
				!archivedBootstrap.body.includes(f.ids.typeForeign),
			'Authenticated Calendar range and bootstrap retain the archived type label and its referenced assignment without foreign data',
			{ rangeStatus: archivedRange.status, bootstrapStatus: archivedBootstrap.status }
		);
		const header = await request('PUT', `${orgPath(f)}/api/assignment-types`, {
			id: f.ids.typePersonnel,
			showInDateHeader: false
		});
		check(
			header.status === 200 && (await row('assignment_types', f.ids.typePersonnel))?.show_in_date_header === false,
			'Header choice persists through assignment type API',
			{ status: header.status }
		);
		await rowAction('Edit assignment type', 'Verification Group Duty');
		await clickButton('Cancel');
		const notification = await rows('notifications');
		check(
			notification.some(
				(item) =>
					!priorNotificationIds.has(item.id) &&
					item.type === 'config_type_deleted' &&
					item.title === 'Assignment Type Deleted'
			),
			'Assignment type deletion notifies administrators'
		);
	} finally {
		checked(await ctx.service.from('assignment_types').upsert(before));
		checked(await ctx.service.from('assignment_types').upsert(retiringType));
		checked(await ctx.service.from('daily_assignments').upsert(retiringAssignment));
		checked(
			await ctx.service.from('assignment_types').delete().eq('organization_id', f.ids.orgA).eq('name', personName)
		);
		checked(
			await ctx.service.from('assignment_types').delete().eq('organization_id', f.ids.orgA).eq('name', groupName)
		);
	}
}

async function checkAvailabilityLifecycle(ctx) {
	const { fixture: f, drive, h, service } = ctx;
	const { check, login, clickButton, fill, personCell, selectModalStatus, waitRow, row, rows } = h;
	const day = Number(f.dates.ui.slice(-2));
	const membership = checked(
		await service
			.from('organization_memberships')
			.select('id,capability_overrides')
			.eq('organization_id', f.ids.orgA)
			.eq('user_id', f.actors.calendarOperate.id)
			.single()
	);
	await login('calendarOperate', 'calendar', ['Able, Synthetic']);
	await personCell('Able, Synthetic', day);
	await selectModalStatus('Verification Leave');
	const deniedMarker = name('Failure feedback');
	try {
		checked(
			await service
				.from('organization_memberships')
				.update({ capability_overrides: { ...membership.capability_overrides, calendar: 'view' } })
				.eq('id', membership.id)
		);
		await fill('Note', deniedMarker);
		await clickButton('Add Status');
		let failedSnapshot = '';
		let prematureSuccess = false;
		let errorVisible = false;
		for (let attempt = 0; attempt < 50; attempt++) {
			failedSnapshot = await drive.snapshot();
			prematureSuccess ||= failedSnapshot.includes('added —');
			errorVisible = /failed|error|unable|denied|permission|could not/i.test(failedSnapshot);
			if (errorVisible || prematureSuccess) break;
			await sleep(100);
		}
		const failedRows = (await rows('availability_entries')).filter((entry) => entry.note === deniedMarker);
		check(
			failedRows.length === 0 && !prematureSuccess && errorVisible,
			'Failed save restores accurate state, shows an error, and emits no success before persistence',
			{ saved: failedRows.length, successVisible: prematureSuccess, errorVisible }
		);
	} finally {
		checked(
			await service
				.from('organization_memberships')
				.update({ capability_overrides: membership.capability_overrides })
				.eq('id', membership.id)
		);
	}
	await h.reload();
	await personCell('Able, Synthetic', day);
	await selectModalStatus('Verification Leave');
	const addMarker = name('Saved availability');
	await fill('Note', addMarker);
	await clickButton('Add Status');
	const created = await waitRow('availability_entries', (entry) => entry.note === addMarker);
	check(
		!!created &&
			created.personnel_id === f.ids.personA &&
			created.status_type_id === f.ids.statusLeave &&
			created.start_date === f.dates.ui &&
			created.end_date === f.dates.ui,
		'Calendar modal saves chosen Person, status, inclusive date and note',
		{ created }
	);
	await h.reload();
	await personCell('Able, Synthetic', day);
	check((await drive.snapshot()).includes(addMarker), 'Saved availability survives full Calendar reload');
	await clickButton('Edit status');
	const deniedEditMarker = name('Denied availability edit');
	await fill('Note', deniedEditMarker);
	try {
		checked(
			await service
				.from('organization_memberships')
				.update({ capability_overrides: { ...membership.capability_overrides, calendar: 'view' } })
				.eq('id', membership.id)
		);
		await clickButton('Update Status');
		let failedEdit = '';
		let prematureEditSuccess = false;
		for (let attempt = 0; attempt < 50; attempt++) {
			failedEdit = await drive.snapshot();
			prematureEditSuccess ||= failedEdit.includes('updated —');
			if (failedEdit.includes('Could not save status') || prematureEditSuccess) break;
			await sleep(100);
		}
		const retainedRows = (await rows('availability_entries')).filter(
			(entry) => entry.id === created?.id || entry.note === deniedEditMarker
		);
		check(
			retainedRows.length === 1 &&
				retainedRows[0].id === created?.id &&
				retainedRows[0].note === addMarker &&
				retainedRows[0].personnel_id === f.ids.personA &&
				retainedRows[0].status_type_id === f.ids.statusLeave &&
				retainedRows[0].start_date === f.dates.ui &&
				retainedRows[0].end_date === f.dates.ui &&
				failedEdit.includes(addMarker) &&
				failedEdit.includes('Could not save status') &&
				!prematureEditSuccess,
			'Failed in-place edit restores the original row and shows an error without success',
			{ retained: retainedRows[0], matchingRows: retainedRows.length, successVisible: prematureEditSuccess }
		);
	} finally {
		checked(
			await service
				.from('organization_memberships')
				.update({ capability_overrides: membership.capability_overrides })
				.eq('id', membership.id)
		);
	}
	await h.reload();
	await personCell('Able, Synthetic', day);
	await clickButton('Edit status');
	const editedMarker = name('Edited availability');
	await fill('Note', editedMarker);
	await clickButton('Update Status');
	const edited = await waitRow('availability_entries', (entry) => entry.note === editedMarker);
	const editedRows = (await rows('availability_entries')).filter(
		(entry) => entry.id === created?.id || entry.note === editedMarker
	);
	check(
		!!edited &&
			edited.id === created?.id &&
			editedRows.length === 1 &&
			edited.personnel_id === f.ids.personA &&
			edited.status_type_id === f.ids.statusLeave &&
			edited.start_date === f.dates.ui &&
			edited.end_date === f.dates.ui &&
			edited.note === editedMarker,
		'Calendar edit updates one saved row in place with the chosen fields',
		{ edited, matchingRows: editedRows.length }
	);
	await h.reload();
	await personCell('Able, Synthetic', day);
	check(
		(await row('availability_entries', created?.id))?.note === editedMarker &&
			(await drive.snapshot()).includes(editedMarker),
		'In-place availability edit survives full Calendar reload'
	);
	await clickButton('Remove status');
	check((await drive.snapshot()).includes('Remove this status entry'), 'Removal asks for explicit confirmation');
	await clickButton('Remove');
	for (let attempt = 0; attempt < 30 && (await row('availability_entries', edited?.id)); attempt++) await sleep(100);
	check(
		!(await row('availability_entries', edited?.id)) &&
			(await row('availability_entries', f.ids.availabilityHistorical))?.note === 'Historical retained',
		'Removal persists while unrelated historical availability remains unchanged'
	);
	await h.reload();
	await personCell('Able, Synthetic', day);
	check(!(await drive.snapshot()).includes(editedMarker), 'Removed availability remains absent after reload');
}

async function checkSpecialDayLifecycle(ctx) {
	const { fixture: f, drive, h, service } = ctx;
	const { check, login, request, row, rows, open, section, rowAction, clickButton, fill, waitRow } = h;
	const addedName = name('Verification Added Closure');
	const editedName = name('Verification Edited Closure');
	const seededHoliday = await row('special_days', f.ids.holidayCustom);
	if (!seededHoliday)
		throw new Blocked('FIXTURE', 'Calendar special-day lifecycle requires its seeded custom holiday.');
	try {
		await login('calendarConfigure', 'calendar/settings', ['Calendar Settings']);
		await section('Closures');
		await clickButton('Add new');
		await fill('Name', addedName);
		await clickButton('Add Closure');
		const createdRow = await waitRow('special_days', (day) => day.name === addedName);
		check(
			!!createdRow && createdRow.date === f.dates.ui && createdRow.type === 'org-closure',
			'Settings closure creation persists the selected default local date and name',
			{ date: createdRow?.date, id: createdRow?.id }
		);
		await h.reload();
		await section('Closures');
		check((await drive.snapshot()).includes(addedName), 'Created closure is visible in settings after reload');
		await rowAction('Edit closure', addedName);
		const deniedName = name('Denied Closure Edit');
		await fill('Name', deniedName);
		const membership = checked(
			await service
				.from('organization_memberships')
				.select('id,capability_overrides')
				.eq('organization_id', f.ids.orgA)
				.eq('user_id', f.actors.calendarConfigure.id)
				.single()
		);
		try {
			checked(
				await service
					.from('organization_memberships')
					.update({ capability_overrides: { ...membership.capability_overrides, calendar: 'view' } })
					.eq('id', membership.id)
			);
			await clickButton('Save Changes');
			let failed = '';
			for (let attempt = 0; attempt < 50; attempt++) {
				failed = await drive.snapshot();
				if (failed.includes('Failed to save closure')) break;
				await sleep(100);
			}
			check(
				failed.includes('Edit Closure') &&
					failed.includes(deniedName) &&
					failed.includes('Failed to save closure') &&
					(await row('special_days', createdRow?.id))?.name === addedName,
				'Failed settings edit retains the dialog and actionable error without changing the saved closure'
			);
		} finally {
			checked(
				await service
					.from('organization_memberships')
					.update({ capability_overrides: membership.capability_overrides })
					.eq('id', membership.id)
			);
		}
		await h.reload();
		await section('Closures');
		await rowAction('Edit closure', addedName);
		await fill('Name', editedName);
		await clickButton('Save Changes');
		const edited = await waitRow('special_days', (day) => day.id === createdRow?.id && day.name === editedName);
		check(
			!!edited && edited.date === f.dates.ui && edited.type === 'org-closure',
			'Settings edit retains closure identity, date and type',
			{ edited }
		);
		await rowAction('Delete closure', editedName);
		check((await drive.snapshot()).includes(editedName), 'Closure deletion confirmation identifies the target');
		await clickButton('Remove');
		for (let attempt = 0; attempt < 30 && (await row('special_days', createdRow?.id)); attempt++) await sleep(100);
		check(
			!(await row('special_days', createdRow?.id)) && !!(await row('special_days', f.ids.closureA)),
			'Confirmed closure deletion removes only its target'
		);
		await clickButton('Reset Federal Holidays');
		check(
			(await drive.snapshot()).includes('Custom closures will be preserved'),
			'Reset confirmation describes closure preservation'
		);
		await clickButton('Reset');
		const resetYear = new Date().getFullYear();
		const expectedHolidays = expectedFederalHolidays(resetYear);
		let days = [];
		for (let attempt = 0; attempt < 50; attempt++) {
			days = await rows('special_days');
			if (
				!days.some((day) => day.id === f.ids.holidayCustom) &&
				expectedHolidays.every(([date, label]) =>
					days.some((day) => day.date === date && day.name === label && day.type === 'federal-holiday')
				)
			)
				break;
			await sleep(100);
		}
		const foreignDays = await rows('special_days', 'orgB');
		check(
			expectedHolidays.every(([date, label]) =>
				days.some((day) => day.date === date && day.name === label && day.type === 'federal-holiday')
			) &&
				!days.some((day) => day.id === f.ids.holidayCustom) &&
				days.some((day) => day.id === f.ids.closureA) &&
				foreignDays.some((day) => day.id === f.ids.closureB),
			'Independently specified current-year federal holidays replace custom rows while fixed 2026 and foreign closures persist',
			{
				resetYear,
				expectedHolidays,
				observed: days
					.filter((day) => day.type === 'federal-holiday' && expectedHolidays.some(([date]) => date === day.date))
					.map((day) => [day.date, day.name])
			}
		);
		await h.reload();
		await section('Closures');
		check(
			(await drive.snapshot()).includes('Verification Unit Closure') &&
				!(await drive.snapshot()).includes('Verification Custom Holiday'),
			'Settings reflects reset and retained closure after reload'
		);
		const calendar = await open(`${orgPath(f)}/calendar`, ['Calendar']);
		check(
			calendar.includes('Verification Unit Closure') && !calendar.includes('Foreign Private Closure'),
			'Calendar shows local closure without foreign closure'
		);
		const rejected = await request('POST', `${orgPath(f, 'orgB')}/api/special-days`, {
			name: name('Denied foreign closure'),
			date: '2026-09-23',
			type: 'org-closure'
		});
		check(denied(rejected.status), 'Foreign closure mutation is rejected', { status: rejected.status });
	} finally {
		checked(await service.from('special_days').upsert(seededHoliday));
		checked(
			await service.from('special_days').delete().eq('organization_id', f.ids.orgA).in('name', [addedName, editedName])
		);
	}
}

async function checkBulkPartialChunk(ctx) {
	const { fixture: f, drive, h, service } = ctx;
	const { check, open, setInput, rows } = h;
	const runTag = randomUUID().slice(0, 8);
	const marker = `Bulk partial ${runTag}`;
	const people = Array.from({ length: 501 }, (_, index) => ({
		id: randomUUID(),
		organization_id: f.ids.orgA,
		group_id: f.ids.groupA,
		first_name: 'Synthetic',
		last_name: `BulkChunk${String(index).padStart(3, '0')}`,
		rank: 'SPC',
		clinic_role: '',
		slug: `verify-bulk-${runTag}-${String(index).padStart(3, '0')}`
	}));
	const clickExact = async (label) => {
		const result = await drive.evaluate(`() => {
			const matches = [...document.querySelectorAll('button')]
				.filter(button => button.textContent?.trim() === ${JSON.stringify(label)});
			if (matches.length === 1) matches[0].click();
			return { matches: matches.length };
		}`);
		if (result.matches !== 1) throw new Blocked('LOCATOR', `Expected one bulk button ${label}.`);
	};
	checked(await service.from('personnel').insert(people));
	try {
		await open(`${orgPath(f)}/calendar/bulk?tab=add`, ['Define the status change']);
		await setInput('input[placeholder="Search by name, rank, MOS, or role..."]', 'BulkChunk');
		await setInput('#statusType', f.ids.statusLeave);
		await setInput('#bulkNote', marker);
		await clickExact('Select shown');
		const selected = await drive.evaluate(
			`() => document.querySelector('[data-slot="data-table-bulk-actions"]')?.textContent?.trim() ?? ''`
		);
		check(
			selected.includes('501 of 501 selected'),
			'Bulk UI selects exactly 501 synthetic People across the 500-row request boundary',
			{ selected }
		);
		await clickExact('Review & Confirm');
		await drive.evaluate(`() => {
			const original = window.fetch;
			const capture = { original, calls: [], notes: [], responses: [] };
			window.__verifyBulkChunks = capture;
			window.fetch = async (...args) => {
				const [input, init] = args;
				if (String(input).includes(${JSON.stringify(`${orgPath(f)}/api/availability/batch`)}) && init?.method === 'POST') {
					const records = JSON.parse(init.body).records;
					const ids = records.map(record => record.personnelId);
					capture.calls.push(ids);
					capture.notes.push([...new Set(records.map(record => record.note))]);
					if (capture.calls.length === 2) {
						capture.responses.push({ status: 503, body: 'Synthetic second-chunk failure' });
						return new Response(JSON.stringify({ message: 'Synthetic second-chunk failure' }), {
							status: 503, headers: { 'Content-Type': 'application/json' }
						});
					}
					const response = await original(...args);
					capture.responses.push({ status: response.status, body: (await response.clone().text()).slice(0, 300) });
					return response;
				}
				return original(...args);
			};
			return true;
		}`);
		try {
			await clickExact('Confirm Apply');
			let feedback = { partial: false, retry: false };
			for (let attempt = 0; attempt < 80; attempt++) {
				feedback = await drive.evaluate(`() => ({
					partial: document.body.innerText.includes('Applied status to 500 of 501 people'),
					retry: document.body.innerText.includes('1 who failed are still selected')
				})`);
				if (feedback.partial) break;
				await sleep(100);
			}
			const calls = await drive.evaluate('() => window.__verifyBulkChunks?.calls ?? []');
			const transport = await drive.evaluate(`() => ({
				notes: window.__verifyBulkChunks?.notes ?? [],
				responses: window.__verifyBulkChunks?.responses ?? []
			})`);
			const saved = (await rows('availability_entries')).filter((entry) => entry.note === marker);
			check(
				calls.length === 2 &&
					calls[0].length === 500 &&
					calls[1].length === 1 &&
					transport.responses[0]?.status === 200 &&
					transport.responses[1]?.status === 503 &&
					transport.notes.every((notes) => notes.length === 1 && notes[0] === marker) &&
					feedback.partial &&
					feedback.retry &&
					saved.length === 500 &&
					saved.every((entry) => calls[0].includes(entry.personnel_id)) &&
					!saved.some((entry) => entry.personnel_id === calls[1][0]),
				'UI reports first-chunk success, keeps the one failed Person selected, and saves no failed second-chunk row',
				{ chunkSizes: calls.map((call) => call.length), transport, feedback, saved: saved.length }
			);
		} finally {
			await drive.evaluate(`() => {
				const capture = window.__verifyBulkChunks;
				if (capture?.original) window.fetch = capture.original;
				return true;
			}`);
		}
		await h.reload();
		check(
			(await rows('availability_entries')).filter((entry) => entry.note === marker).length === 500,
			'After reload, only the first 500 bulk entries remain saved'
		);
	} finally {
		checked(await service.from('availability_entries').delete().eq('organization_id', f.ids.orgA).eq('note', marker));
		checked(
			await service.from('personnel').delete().eq('organization_id', f.ids.orgA).like('slug', `verify-bulk-${runTag}-%`)
		);
	}
}

async function checkBulkImportAndRemoval(ctx) {
	const { fixture: f, drive, h, service } = ctx;
	const { check, open, fill, clickButton, setInput, row, waitRow, rows } = h;
	const importMarker = name('Imported through UI');
	await open(`${orgPath(f)}/calendar/bulk?tab=import`, ['Bring in status rows']);
	await fill(
		'Paste CSV data',
		`Last name,First name,Start date,End date,Status,Note\nAble,Synthetic,${f.dates.later},${f.dates.later},Verification Leave,${importMarker}`
	);
	await clickButton('Parse');
	const preview = await drive.snapshot();
	check(preview.includes('1 of 1 rows selected'), 'Valid import preview selects exactly the specified Person and row');
	await drive.evaluate(`() => {
		const original = window.fetch;
		const capture = { original, request: null, response: null };
		window.__verifyImportRequest = capture;
		window.fetch = async (...args) => {
			const [input, init] = args;
			const isImport = String(input).includes(${JSON.stringify(`${orgPath(f)}/api/availability/batch`)}) && init?.method === 'POST';
			if (isImport) {
				const records = JSON.parse(init.body).records;
				capture.request = { count: records.length, notes: [...new Set(records.map(record => record.note))] };
			}
			const response = await original(...args);
			if (isImport) capture.response = { status: response.status, body: (await response.clone().text()).slice(0, 300) };
			return response;
		};
		return true;
	}`);
	let imported = null;
	let importedResult = '';
	let transport = null;
	try {
		await clickButton('Next');
		imported = await waitRow('availability_entries', (entry) => entry.note === importMarker);
		for (let attempt = 0; attempt < 40; attempt++) {
			importedResult = await drive.evaluate(`() => {
				const heading = [...document.querySelectorAll('h2')].find(node => node.textContent?.trim() === 'Import complete');
				return heading?.closest('section')?.innerText ?? document.body.innerText;
			}`);
			if (importedResult.includes('Import complete') && /1\s+status entry imported\s+successfully/.test(importedResult))
				break;
			await sleep(100);
		}
		transport = await drive.evaluate(`() => ({
			request: window.__verifyImportRequest?.request ?? null,
			response: window.__verifyImportRequest?.response ?? null
		})`);
	} finally {
		await drive.evaluate(`() => {
			const capture = window.__verifyImportRequest;
			if (capture?.original) window.fetch = capture.original;
			return true;
		}`);
	}
	check(
		!!imported &&
			imported.personnel_id === f.ids.personA &&
			imported.status_type_id === f.ids.statusLeave &&
			imported.start_date === f.dates.later &&
			imported.end_date === f.dates.later &&
			transport?.request?.count === 1 &&
			transport.request.notes.length === 1 &&
			transport.request.notes[0] === importMarker &&
			transport.response?.status === 200 &&
			/1\s+status entry imported\s+successfully/.test(importedResult),
		'Completed UI import reports success and saves only the selected Person, status, date and note',
		{ importedId: imported?.id, transport, visibleResult: importedResult.slice(0, 700) }
	);
	await h.reload();
	check(
		(await rows('availability_entries')).filter((entry) => entry.note === importMarker).length === 1,
		'Completed UI import remains saved after full reload'
	);
	checked(
		await service.from('availability_entries').delete().eq('organization_id', f.ids.orgA).eq('note', importMarker)
	);
	const overlapId = randomUUID();
	checked(
		await service.from('availability_entries').insert({
			id: overlapId,
			organization_id: f.ids.orgA,
			personnel_id: f.ids.personA,
			status_type_id: f.ids.statusLeave,
			start_date: f.dates.uiBefore,
			end_date: f.dates.uiAfter,
			note: 'Synthetic complete-overlap removal target'
		})
	);
	try {
		await open(`${orgPath(f)}/calendar/bulk?tab=remove`, ['Define what to remove']);
		await setInput('#removeStatusType', f.ids.statusLeave);
		await drive.tool('click', { uid: await drive.uid('checkbox', 'Select SPC Able, Synthetic') });
		await clickButton('Review Matching Entries');
		const review = await drive.snapshot();
		check(
			review.includes('1 partial overlap will also be removed entirely') &&
				!!(await row('availability_entries', overlapId)),
			'UI warns that a partially overlapping saved row will be removed in full before confirmation'
		);
		await clickButton('Confirm Removal');
		for (let attempt = 0; attempt < 40 && (await row('availability_entries', overlapId)); attempt++) await sleep(100);
		check(
			!(await row('availability_entries', overlapId)) &&
				!!(await row('availability_entries', f.ids.availabilityHistorical)) &&
				!!(await row('availability_entries', f.ids.availabilityCurrent)),
			'Confirmed UI removal deletes the whole selected overlap while retaining historical and other-Person entries'
		);
		await h.reload();
		check(!(await row('availability_entries', overlapId)), 'UI removal remains deleted after full reload');
	} finally {
		checked(await service.from('availability_entries').delete().eq('id', overlapId));
	}
}

async function checkAvailabilityBulk(ctx) {
	const { fixture: f, drive, h, service } = ctx;
	const { check, login, request, rows, open, fill, clickButton, setInput } = h;
	const { ids, dates } = f;
	await login('calendarOperate', 'calendar/bulk', ['Define the status change']);
	const initial = await drive.snapshot();
	check(
		initial.includes('Able, Synthetic') &&
			initial.includes('Baker, Synthetic') &&
			initial.includes('Verification Leave') &&
			!initial.includes('Foreign, Synthetic'),
		'Bulk add shows allowed People and Organization status choices only'
	);
	const marker = name('Bulk saved');
	const records = [ids.personA, ids.personB].map((personnelId) => ({
		personnelId,
		statusTypeId: ids.statusLeave,
		startDate: dates.later,
		endDate: dates.later,
		note: marker
	}));
	const add = await request('POST', `${orgPath(f)}/api/availability/batch`, { records });
	const persisted = (await rows('availability_entries')).filter((entry) => entry.note === marker);
	check(
		add.status === 200 &&
			persisted.length === 2 &&
			new Set(persisted.map((entry) => entry.personnel_id)).size === 2 &&
			persisted.every(
				(entry) =>
					entry.status_type_id === ids.statusLeave && entry.start_date === dates.later && entry.end_date === dates.later
			),
		'Authorized batch saves exactly selected People, status, inclusive dates and note',
		{ status: add.status, savedPeople: persisted.map((entry) => entry.personnel_id) }
	);
	await h.reload();
	check(
		(await rows('availability_entries')).filter((entry) => entry.note === marker).length === 2,
		'Batch data survives full reload'
	);
	const failedMarker = name('Bulk denied chunk');
	const second = await request('POST', `${orgPath(f)}/api/availability/batch`, {
		records: [
			{
				personnelId: ids.personForeign,
				statusTypeId: ids.statusLeave,
				startDate: dates.later,
				endDate: dates.later,
				note: failedMarker
			}
		]
	});
	check(
		denied(second.status) &&
			(await rows('availability_entries')).filter((entry) => entry.note === marker).length === 2 &&
			(await rows('availability_entries')).every((entry) => entry.note !== failedMarker),
		'A later authorization-denied batch does not erase the earlier successful batch or pretend the failed row saved',
		{ failedStatus: second.status, retainedCount: persisted.length }
	);
	const removed = await request('DELETE', `${orgPath(f)}/api/availability/batch`, {
		ids: persisted.map((entry) => entry.id)
	});
	check(
		removed.status === 200 &&
			(await rows('availability_entries')).every((entry) => entry.note !== marker) &&
			(await rows('availability_entries')).some((entry) => entry.id === ids.availabilityHistorical),
		'Authorized batch removal clears only selected entries and preserves historical availability',
		{ status: removed.status }
	);
	const importPage = await open(`${orgPath(f)}/calendar/bulk?tab=import`, ['Bring in status rows']);
	check(importPage.includes('Paste CSV data'), 'Calendar import exposes the supported paste and review flow');
	await fill(
		'Paste CSV data',
		`Last name,First name,Start date,End date,Status\nMissing,Synthetic,${dates.start},${dates.end},Verification Leave\nAble,Synthetic,${dates.end},${dates.start},Verification Leave`
	);
	await clickButton('Parse');
	const parsed = await drive.snapshot();
	check(
		parsed.includes('Person not found') &&
			parsed.includes('End date must be on or after start date') &&
			parsed.includes('errors'),
		'Import review reports unknown Person and invalid date range before persistence'
	);
	check(
		(await rows('availability_entries')).every((entry) => entry.note !== failedMarker),
		'Invalid imported rows have no saved effect'
	);
	const duplicateId = randomUUID();
	checked(
		await service.from('personnel').insert({
			id: duplicateId,
			organization_id: ids.orgA,
			group_id: ids.groupA,
			first_name: 'Synthetic',
			last_name: 'Able',
			rank: 'PFC',
			clinic_role: '',
			slug: `verify-ambiguous-${duplicateId.slice(0, 8)}`
		})
	);
	try {
		await h.reload();
		await fill(
			'Paste CSV data',
			`Last name,First name,Start date,End date,Status\nAble,Synthetic,${dates.start},${dates.end},Verification Leave`
		);
		await clickButton('Parse');
		const ambiguous = await drive.snapshot();
		check(
			ambiguous.includes('Multiple people with this name') && ambiguous.includes('add Rank column to disambiguate'),
			'Import review reports two active People with the same name as ambiguous before persistence'
		);
	} finally {
		checked(await service.from('personnel').delete().eq('id', duplicateId));
	}
	const removePage = await open(`${orgPath(f)}/calendar/bulk?tab=remove`, ['Define what to remove']);
	check(
		removePage.includes('Review matching entries') || removePage.includes('Define what to remove'),
		'Bulk removal offers a review step before whole-entry deletion'
	);
	await setInput('#removeStatusType', ids.statusTraining);
	await drive.tool('click', { uid: await drive.uid('checkbox', 'Select SPC Baker, Synthetic') });
	await clickButton('Review Matching Entries');
	const review = await drive.snapshot();
	check(
		review.includes('1 partial overlap will also be removed entirely') &&
			review.includes('Baker, Synthetic') &&
			review.includes('Nothing is removed until you confirm') &&
			(await rows('availability_entries')).some((entry) => entry.id === ids.availabilityCurrent),
		'Partial-overlap removal review names Baker, explains whole-entry deletion, and leaves the saved row intact before confirmation'
	);
	await clickButton('Back');
	check(
		(await rows('availability_entries')).some((entry) => entry.id === ids.availabilityCurrent),
		'Backing out of partial-overlap review preserves the complete saved entry'
	);
	await checkBulkImportAndRemoval(ctx);
	await checkBulkPartialChunk(ctx);
}

async function checkCatalogAuthorization(ctx) {
	const { fixture: f, h } = ctx;
	const { check, login, request, rows } = h;
	const families = [
		[
			'status-types',
			{ name: name('Denied Status'), color: '#166534', textColor: '#ffffff', sortOrder: 1 },
			'status_types'
		],
		[
			'assignment-types',
			{ name: name('Denied Assignment'), shortName: 'DN', assignTo: 'personnel', color: '#166534', sortOrder: 1 },
			'assignment_types'
		],
		['special-days', { name: name('Denied Closure'), date: '2026-09-21', type: 'org-closure' }, 'special_days']
	];
	for (const role of [
		'calendarView',
		'calendarOperate',
		'calendarScoped',
		'calendarEmpty',
		'calendarScopedConfig',
		'manager'
	]) {
		await login(
			role,
			role === 'manager' ? 'personnel' : 'calendar',
			role === 'manager' ? ['Able, Synthetic'] : ['Calendar', 'Access restricted']
		);
		for (const [family, payload, table] of families) {
			const response = await request('POST', `${orgPath(f)}/api/${family}`, payload);
			const saved = (await rows(table)).filter((row) => row.name === payload.name);
			check(
				denied(response.status) && saved.length === 0,
				`${role} cannot configure ${family} without Calendar configuration and Organization scope`,
				{ status: response.status, saved: saved.length }
			);
		}
	}
	await login('calendarConfigure');
	for (const [family, payload, table] of families) {
		const response = await request('POST', `${orgPath(f, 'orgB')}/api/${family}`, payload);
		check(
			denied(response.status) && (await rows(table, 'orgB')).every((row) => row.name !== payload.name),
			`Organization A configurator cannot configure foreign ${family}`,
			{ status: response.status }
		);
	}
	const permitted = await request(
		'GET',
		`${orgPath(f)}/api/calendar-range?rangeStart=${f.dates.start}&rangeEnd=${f.dates.end}`
	);
	check(
		permitted.status === 200 &&
			permitted.body.includes(f.ids.statusLeave) &&
			permitted.body.includes(f.ids.typePersonnel),
		'Organization Calendar configurator can consume its own status and assignment catalogs',
		{ status: permitted.status }
	);
}

async function checkAvailabilityConsumers(ctx) {
	const { fixture: f, drive, h } = ctx;
	const { check, login, request, open, clickButton } = h;
	const { ids, dates } = f;
	await login('calendarLane');
	for (const [start, end] of [
		[dates.start, dates.end],
		[dates.historical, dates.later]
	]) {
		const response = await request('GET', `${orgPath(f)}/api/calendar-range?rangeStart=${start}&rangeEnd=${end}`);
		const expected =
			start === dates.historical
				? [ids.availabilityHistorical, ids.availabilityAlpha, ids.availabilityBravo, ids.availabilityUnassigned]
				: [ids.availabilityAlpha, ids.availabilityBravo, ids.availabilityUnassigned];
		if (dates.uiBefore <= end && dates.uiAfter >= start) expected.push(ids.availabilityCurrent);
		check(
			response.status === 200 &&
				expected.every((id) => response.body.includes(id)) &&
				!response.body.includes(ids.availabilityForeign),
			`Calendar range ${start} to ${end} includes explicit saved availability and excludes foreign rows`,
			{ status: response.status, expectedIds: expected }
		);
		check(
			response.body.includes(ids.statusLeave) &&
				response.body.includes(ids.closureA) &&
				!response.body.includes(ids.closureB),
			'Calendar range carries authorized catalog and closure facts'
		);
	}
	const report = await request(
		'GET',
		`${orgPath(f)}/api/calendar-reports/status-days?startDate=${dates.start}&endDate=${dates.end}`
	);
	check(
		report.status === 200 &&
			[ids.availabilityAlpha, ids.availabilityBravo, ids.availabilityUnassigned].every((id) =>
				report.body.includes(id)
			) &&
			!report.body.includes(ids.availabilityForeign) &&
			!report.body.includes(ids.closureA),
		'Status-day report supplies authorized availability and no special-day export',
		{ status: report.status }
	);
	const reportPage = await open(`${orgPath(f)}/calendar/reports`, ['Calendar', 'Status']);
	check(
		reportPage.includes('Status') && !reportPage.includes('Foreign Private Status'),
		'Status-day report page is available without foreign catalog labels'
	);
	await clickButton('2026');
	await clickButton('Run status-day report');
	let renderedReport = '';
	for (let attempt = 0; attempt < 40; attempt++) {
		renderedReport = await drive.snapshot();
		if (renderedReport.includes('Export status days')) break;
		await sleep(100);
	}
	check(
		renderedReport.includes('Export status days') &&
			renderedReport.includes('Able, Synthetic') &&
			renderedReport.includes('Baker, Synthetic') &&
			!renderedReport.includes('Foreign, Synthetic'),
		'Status-day report renders saved local People and permits export without foreign rows'
	);
	await drive.evaluate(`() => {
		const original = URL.createObjectURL;
		window.__verifyCalendarExport = { original, blob: null };
		URL.createObjectURL = function(blob) {
			window.__verifyCalendarExport.blob = blob;
			return original.call(URL, blob);
		};
		return true;
	}`);
	await clickButton('Export status days');
	const captured = await drive.evaluate(`async () => {
		for (let attempt = 0; attempt < 80 && !window.__verifyCalendarExport?.blob; attempt++)
			await new Promise(resolve => setTimeout(resolve, 100));
		const capture = window.__verifyCalendarExport;
		URL.createObjectURL = capture.original;
		if (!capture.blob) return { captured: false };
		const bytes = new Uint8Array(await capture.blob.arrayBuffer());
		let binary = '';
		for (let index = 0; index < bytes.length; index += 8192)
			binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
		return { captured: true, base64: btoa(binary) };
	}`);
	if (captured.captured) {
		const { default: ExcelJS } = await import('exceljs');
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(Buffer.from(captured.base64, 'base64'));
		const sheet = workbook.getWorksheet('Status Days');
		const headers = sheet
			? Array.from({ length: sheet.columnCount }, (_, index) => String(sheet.getRow(1).getCell(index + 1).value ?? ''))
			: [];
		const findPerson = (lastName) => {
			if (!sheet) return null;
			const nameColumn = headers.indexOf('Last Name') + 1;
			for (let index = 2; index <= sheet.rowCount; index++) {
				const row = sheet.getRow(index);
				if (String(row.getCell(nameColumn).value) === lastName) return row;
			}
			return null;
		};
		const statusDays = (lastName, status) => {
			const row = findPerson(lastName);
			const column = headers.indexOf(status) + 1;
			return row && column > 0 ? Number(row.getCell(column).value ?? 0) : null;
		};
		check(
			!!sheet &&
				statusDays('Able', 'Verification Leave') === 4 &&
				statusDays('Baker', 'Verification Training') ===
					1 + inclusiveOverlapDays(dates.uiBefore, dates.uiAfter, '2026-01-01', '2026-12-31') &&
				statusDays('Unassigned', 'Verification Leave') === 1 &&
				!findPerson('Foreign') &&
				!headers.includes('Foreign Private Status') &&
				!headers.includes('Verification Unit Closure'),
			'Downloaded status-day workbook contains independently expected saved day counts and status labels without foreign or special-day facts',
			{
				headers,
				ableLeave: statusDays('Able', 'Verification Leave'),
				bakerTraining: statusDays('Baker', 'Verification Training')
			}
		);
	} else {
		check(false, 'Status-day export produces a downloadable workbook');
	}
	await login('calendarView');
	const calendarPage = await open(`${orgPath(f)}/calendar`, ['Calendar']);
	check(
		calendarPage.includes('Verification Leave') && !calendarPage.includes('Foreign Private Status'),
		'Calendar surface shows its saved status label, not the foreign label'
	);
	await drive.evaluate(
		`() => { document.querySelector('[data-testid="calendar-month-label"]')?.click(); return true; }`
	);
	const selectedMonth = await drive.evaluate(`async () => {
		const dialog = document.querySelector('[role="dialog"][aria-label="Month and year picker"]');
		if (!dialog) return false;
		let displayedYear = Number(dialog.querySelector('span')?.textContent);
		const direction = displayedYear > 2026 ? 'Previous year' : 'Next year';
		const yearButton = [...dialog.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === direction);
		const steps = Math.abs(displayedYear - 2026);
		for (let attempt = 0; attempt < steps && displayedYear !== 2026; attempt++) {
			yearButton?.click();
			await new Promise(resolve => setTimeout(resolve, 0));
			displayedYear = Number(dialog.querySelector('span')?.textContent);
		}
		if (displayedYear !== 2026) return false;
		const month = [...dialog.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Sep');
		month?.click();
		return !!month;
	}`);
	if (!selectedMonth) throw new Blocked('LOCATOR', 'Could not select September 2026 in Calendar month picker.');
	for (let attempt = 0; attempt < 40; attempt++) {
		if (
			await drive.evaluate(
				`() => document.querySelector('[data-testid="calendar-month-label"]')?.textContent?.includes('September 2026')`
			)
		)
			break;
		await sleep(100);
	}
	const renderedMonth = await drive.evaluate(`() => {
		const cells = name => {
			const row = [...document.querySelectorAll('.personnel-row')].find(row => row.querySelector('.personnel-info')?.textContent?.includes(name));
			return [...(row?.querySelectorAll('[data-slot="date-cell"]') ?? [])].map(cell => cell.getAttribute('title') ?? '');
		};
		return { title: document.querySelector('[data-testid="calendar-month-label"]')?.textContent,
			closure: [...document.querySelectorAll('.date-headers button[title]')].some(button => button.title.includes('Verification Unit Closure')),
			able: cells('Able, Synthetic'), baker: cells('Baker, Synthetic'), unassigned: cells('Unassigned, Synthetic') };
	}`);
	check(
		renderedMonth.title?.includes('September 2026') &&
			renderedMonth.able.filter((title) => title.includes('Verification Leave - Alpha seeded leave')).length === 3 &&
			renderedMonth.baker.some((title) => title.includes('Verification Training - Bravo seeded training')) &&
			renderedMonth.unassigned.some((title) => title.includes('Verification Leave - Unassigned seeded leave')) &&
			renderedMonth.closure,
		'September month view renders the seeded Person statuses and Organization closure',
		renderedMonth
	);
	await clickButton('3-Month');
	const longSeptember = await drive.evaluate(`() => {
		const titles = [...document.querySelectorAll('.status-cell[title]')].map(cell => cell.title);
		return { label: document.querySelector('[data-testid="long-range-date-label"]')?.textContent,
			leave: titles.filter(title => title === 'Verification Leave').length,
			training: titles.filter(title => title === 'Verification Training').length,
			closure: [...document.querySelectorAll('button[title="Verification Unit Closure"]')].length };
	}`);
	check(
		longSeptember.label?.includes('September 2026') &&
			longSeptember.leave >= 3 &&
			longSeptember.training >= 1 &&
			longSeptember.closure > 0,
		'Long-range view renders the seeded statuses and closure',
		longSeptember
	);
	const waitForLongRange = async (label, expectedLeave) => {
		let view;
		for (let attempt = 0; attempt < 50; attempt++) {
			view = await drive.evaluate(`() => {
				const text = document.body.innerText;
				return {
					label: document.querySelector('[data-testid="long-range-date-label"]')?.textContent,
					leave: [...document.querySelectorAll('.status-cell[title]')].filter(cell => cell.title === 'Verification Leave').length,
					loading: text.includes('Loading additional calendar dates...'),
					error: text.includes('Additional calendar data is temporarily unavailable.'),
					retry: text.includes('Retry calendar load')
				};
			}`);
			if (view.label?.trim() === label && expectedLeave(view.leave) && !view.loading && !view.error && !view.retry)
				return view;
			if (view.label?.trim() === label && (view.error || view.retry)) break;
			await sleep(100);
		}
		const network = await drive.tool('list_network_requests', { resourceTypes: ['fetch', 'xhr'] });
		const source = network.content?.map((item) => item.text ?? '').join('\n') ?? '';
		const statuses = [...source.matchAll(/GET [^\n]*\/api\/calendar-range\?[^\n]* \[(\d{3})\]/g)];
		view.rangeStatus = Number(statuses.at(-1)?.[1]) || null;
		if (view.loading || view.error || view.retry || view.rangeStatus === 429)
			throw new Blocked('RANGE_LOAD', `${label} Calendar range did not settle: ${JSON.stringify(view)}`);
		return view;
	};
	for (let index = 0; index < 2; index++) await clickButton('Prev 3 Months');
	const historicalView = await waitForLongRange('March 2026 – May 2026', (leave) => leave === 1);
	check(
		historicalView.label?.trim() === 'March 2026 – May 2026' && historicalView.leave === 1,
		'Moving to the historical quarter renders the single retained March leave day',
		historicalView
	);
	for (let index = 0; index < 2; index++) await clickButton('Next 3 Months');
	const returnedView = await waitForLongRange('September 2026 – November 2026', (leave) => leave >= 3);
	check(
		returnedView.label?.trim() === 'September 2026 – November 2026' && returnedView.leave >= 3,
		'Moving back to September restores the same saved availability',
		returnedView
	);
	const dashboard = await open(`${orgPath(f)}`, ['Dashboard', 'Overview']);
	check(
		dashboard.includes('Verification Training') &&
			dashboard.includes('1 out') &&
			!dashboard.includes('Foreign Private Status') &&
			!dashboard.includes('Foreign, Synthetic'),
		'Dashboard projects Baker’s current saved training status as one unavailable Person without foreign facts'
	);
	await h.reload();
	const reloaded = await drive.snapshot();
	check(!reloaded.includes('Foreign Private Status'), 'Dashboard remains scoped after reload');
}

async function checkStateIsolation(ctx) {
	const { fixture: f, drive, h, service } = ctx;
	const { check, login, open, request, rows } = h;
	const { ids, dates } = f;
	await login('calendarSwitch', 'calendar/settings', ['Calendar Settings']);
	const first = await drive.snapshot();
	check(
		first.includes('Verification Leave') && !first.includes('Foreign Private Status'),
		'Organization A settings shows only Organization A catalog'
	);
	await open(`${orgPath(f)}/calendar`, ['Calendar']);
	await drive.evaluate(
		`() => { document.querySelector('[data-testid="calendar-month-label"]')?.click(); return true; }`
	);
	const pickerBefore = await drive.evaluate(`() => ({
		open: !!document.querySelector('[role="dialog"][aria-label="Month and year picker"]'),
		focused: document.activeElement?.textContent?.trim()
	})`);
	await drive.tool('press_key', { key: 'ArrowLeft' });
	const pickerAfterArrow = await drive.evaluate(`() => document.activeElement?.textContent?.trim()`);
	await drive.tool('press_key', { key: 'Escape' });
	const pickerClosed = await drive.evaluate(
		`() => !document.querySelector('[role="dialog"][aria-label="Month and year picker"]')`
	);
	check(
		pickerBefore.open &&
			!!pickerBefore.focused &&
			!!pickerAfterArrow &&
			pickerAfterArrow !== pickerBefore.focused &&
			pickerClosed,
		'Month picker supports keyboard focus movement and Escape dismissal',
		{ pickerBefore, pickerAfterArrow, pickerClosed }
	);
	await drive.evaluate(`() => {
		const original = window.fetch;
		const probe = { seen: false, retryStarted: false, retryStatus: null, original };
		window.__verifyCalendarRangeFailure = probe;
		window.fetch = async (...args) => {
			if (!probe.seen && String(args[0]).includes(${JSON.stringify(`${orgPath(f)}/api/calendar-range`)})) {
				probe.seen = true;
				return Promise.resolve(new Response(JSON.stringify({ error: 'Synthetic range failure' }),
					{ status: 503, headers: { 'Content-Type': 'application/json' } }));
			}
			const response = await original(...args);
			if (probe.retryStarted && String(args[0]).includes(${JSON.stringify(`${orgPath(f)}/api/calendar-range`)}))
				probe.retryStatus = response.status;
			return response;
		};
		return true;
	}`);
	try {
		await h.clickButton('3-Month');
		let failure = '';
		for (let attempt = 0; attempt < 40; attempt++) {
			failure = await drive.snapshot();
			if (failure.includes('Retry calendar load')) break;
			await sleep(100);
		}
		const failureSeen = await drive.evaluate(`() => !!window.__verifyCalendarRangeFailure?.seen`);
		check(
			failureSeen &&
				failure.includes('Additional calendar data is temporarily unavailable.') &&
				failure.includes('Retry calendar load') &&
				!failure.includes('Foreign Private Status'),
			'A failed additional range load shows a scoped, actionable retry state',
			{ failureSeen }
		);
		await drive.evaluate(`() => { window.__verifyCalendarRangeFailure.retryStarted = true; return true; }`);
		await h.clickButton('Retry calendar load');
		let retried = '';
		let retryStatus = null;
		for (let attempt = 0; attempt < 50; attempt++) {
			retried = await drive.snapshot();
			retryStatus = await drive.evaluate(`() => window.__verifyCalendarRangeFailure?.retryStatus ?? null`);
			if (
				retryStatus === 200 &&
				!retried.includes('Additional calendar data is temporarily unavailable.') &&
				!retried.includes('Retry calendar load') &&
				!retried.includes('Loading additional calendar dates') &&
				retried.includes('Verification Leave')
			)
				break;
			await sleep(100);
		}
		check(
			retryStatus === 200 &&
				!retried.includes('Additional calendar data is temporarily unavailable.') &&
				!retried.includes('Retry calendar load') &&
				!retried.includes('Loading additional calendar dates') &&
				retried.includes('Verification Leave') &&
				!retried.includes('Foreign Private Status'),
			'Retry loads the Calendar range without mixing foreign catalog data',
			{ retryStatus }
		);
	} finally {
		await drive.evaluate(
			`() => { const probe = window.__verifyCalendarRangeFailure; if (probe?.original) window.fetch = probe.original; return true; }`
		);
	}
	const foreign = await open(`${orgPath(f, 'orgB')}/calendar/settings`, ['Calendar Settings', 'Access restricted']);
	check(
		!foreign.includes('Verification Leave') && !foreign.includes('Verification Unit Closure'),
		'Switching to Organization B clears Organization A settings data'
	);
	const foreignCalendar = await open(`${orgPath(f, 'orgB')}/calendar`, ['Calendar']);
	check(
		foreignCalendar.includes('Foreign Private Status') && !foreignCalendar.includes('Verification Leave'),
		'Organization B Calendar shows its own status and excludes Organization A status'
	);
	await open(`${orgPath(f)}/calendar`, ['Calendar']);
	await drive.evaluate(`() => {
		const original = window.fetch;
		const barrier = { seen: false, release: null, original };
		window.__verifyCalendarRangeBarrier = barrier;
		window.fetch = async (...args) => {
			const response = await original(...args);
			if (!barrier.seen && String(args[0]).includes(${JSON.stringify(`${orgPath(f)}/api/calendar-range`)})) {
				barrier.seen = true;
				return new Promise(resolve => { barrier.release = () => resolve(response); });
			}
			return response;
		};
		return true;
	}`);
	try {
		const inLongView = await drive.evaluate(`() => !!document.querySelector('[data-testid="long-range-date-label"]')`);
		await h.clickButton(inLongView ? 'Next 3 Months' : '3-Month');
		let intercepted = false;
		for (let attempt = 0; attempt < 40; attempt++) {
			intercepted = await drive.evaluate('() => !!window.__verifyCalendarRangeBarrier?.seen');
			if (intercepted) break;
			await sleep(100);
		}
		if (!intercepted) throw new Blocked('RANGE_INTERCEPT', '3-month Calendar view did not request an uncovered range.');
		await h.clickButton('Switch organization');
		for (let attempt = 0; attempt < 40; attempt++) {
			const ready = await drive.evaluate(
				`() => [...document.querySelectorAll('[role="menuitem"]')].some(item => item.textContent?.includes('Verification Organization B'))`
			);
			if (ready) break;
			await sleep(100);
		}
		const selection = await drive.evaluate(`() => {
			const matches = [...document.querySelectorAll('[role="menuitem"]')]
				.filter(item => item.textContent?.includes('Verification Organization B'));
			if (matches.length === 1) matches[0].click();
			return { matches: matches.length };
		}`);
		if (selection.matches !== 1)
			throw new Blocked('LOCATOR', `Expected one Organization B switcher item; found ${selection.matches}.`);
		for (let attempt = 0; attempt < 60; attempt++) {
			if ((await drive.evaluate('() => location.pathname')).startsWith(orgPath(f, 'orgB'))) break;
			await sleep(100);
		}
		const beforeRelease = await drive.snapshot();
		check(
			beforeRelease.includes('Foreign Private Status') &&
				!beforeRelease.includes('Verification Leave') &&
				(await drive.evaluate('() => location.pathname')).startsWith(orgPath(f, 'orgB')),
			'Organization B renders its own Calendar while an Organization A range response is held'
		);
		const released = await drive.evaluate(`() => {
			const barrier = window.__verifyCalendarRangeBarrier;
			if (!barrier?.release) return { released: false };
			barrier.release();
			window.fetch = barrier.original;
			return { released: true };
		}`);
		if (!released.released)
			throw new Blocked('RANGE_INTERCEPT', 'Delayed A response was lost before it could be released.');
		await sleep(300);
		const afterRelease = await drive.snapshot();
		check(
			afterRelease.includes('Foreign Private Status') &&
				!afterRelease.includes('Verification Leave') &&
				!afterRelease.includes('Verification Unit Closure'),
			'A late Organization A range response cannot restore its labels or closures after switching to B'
		);
	} finally {
		await drive.evaluate(`() => {
			const barrier = window.__verifyCalendarRangeBarrier;
			if (barrier?.release) barrier.release();
			if (barrier?.original) window.fetch = barrier.original;
			return true;
		}`);
	}
	await open(`${orgPath(f)}/calendar`, ['Calendar']);
	if (await drive.evaluate(`() => !!document.querySelector('[data-testid="long-range-date-label"]')`))
		await h.clickButton('3-Month');
	await h.clickButton('Today');
	await h.personCell('Able, Synthetic', Number(dates.ui.slice(-2)));
	await h.selectModalStatus('Verification Leave');
	const mutationMarker = name('Pending scoped availability');
	await h.fill('Note', mutationMarker);
	await drive.evaluate(`() => {
		const original = window.fetch;
		const barrier = { seen: false, release: null, status: null, original };
		window.__verifyCalendarMutationBarrier = barrier;
		window.fetch = async (...args) => {
			const response = await original(...args);
			if (!barrier.seen && String(args[0]).includes(${JSON.stringify(`${orgPath(f)}/api/availability`)}) && args[1]?.method === 'POST') {
				barrier.seen = true;
				barrier.status = response.status;
				return new Promise(resolve => { barrier.release = () => resolve(response); });
			}
			return response;
		};
		return true;
	}`);
	try {
		await h.clickButton('Add Status');
		let savedMutation = null;
		let heldMutation = null;
		for (let attempt = 0; attempt < 50; attempt++) {
			savedMutation = (await rows('availability_entries')).find((entry) => entry.note === mutationMarker);
			heldMutation = await drive.evaluate(`() => ({
				seen: !!window.__verifyCalendarMutationBarrier?.seen,
				status: window.__verifyCalendarMutationBarrier?.status,
				ready: !!window.__verifyCalendarMutationBarrier?.release
			})`);
			if (savedMutation && heldMutation.ready) break;
			await sleep(100);
		}
		check(
			!!savedMutation &&
				heldMutation?.status === 200 &&
				heldMutation.ready &&
				savedMutation.organization_id === ids.orgA &&
				savedMutation.personnel_id === ids.personA,
			'Pending Calendar mutation has persisted only to Organization A while its response is held',
			{ savedId: savedMutation?.id, heldMutation }
		);
		const switchButton = await drive.evaluate(`() => {
			const button = [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === 'Switch organization');
			button?.click();
			return !!button;
		}`);
		if (!switchButton)
			throw new Blocked('LOCATOR', 'Organization switcher unavailable during pending Calendar mutation.');
		let selected = false;
		for (let attempt = 0; attempt < 40; attempt++) {
			selected = await drive.evaluate(`() => {
				const item = [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent?.includes('Verification Organization B'));
				if (item) item.click();
				return !!item;
			}`);
			if (selected) break;
			await sleep(100);
		}
		if (!selected) throw new Blocked('LOCATOR', 'Organization B switcher item unavailable during pending mutation.');
		for (let attempt = 0; attempt < 60; attempt++) {
			if ((await drive.evaluate(`() => location.pathname`)).startsWith(orgPath(f, 'orgB'))) break;
			await sleep(100);
		}
		const pendingForeign = await drive.snapshot();
		const pendingPath = await drive.evaluate(`() => location.pathname`);
		check(
			pendingPath.startsWith(orgPath(f, 'orgB')) &&
				pendingForeign.includes('Foreign Private Status') &&
				!pendingForeign.includes(mutationMarker) &&
				!pendingForeign.includes('Verification Leave'),
			'Organization B renders only its own Calendar while A mutation feedback remains pending',
			{
				path: pendingPath,
				foreign: pendingForeign.includes('Foreign Private Status'),
				oldStatus: pendingForeign.includes('Verification Leave'),
				oldMutation: pendingForeign.includes(mutationMarker),
				matches: pendingForeign
					.split('\n')
					.filter((line) => /Foreign Private Status|Verification Leave|Pending scoped availability/.test(line))
					.slice(0, 12)
			}
		);
		const release = await drive.evaluate(`() => {
			const barrier = window.__verifyCalendarMutationBarrier;
			if (!barrier?.release) return false;
			barrier.release();
			window.fetch = barrier.original;
			return true;
		}`);
		if (!release) throw new Blocked('MUTATION_INTERCEPT', 'Held A mutation response could not be released.');
		let settledForeign = '';
		let staleFeedback = false;
		for (let attempt = 0; attempt < 12; attempt++) {
			settledForeign = await drive.snapshot();
			staleFeedback ||= /Calendar access changed|Could not confirm the saved status|added —/.test(settledForeign);
			await sleep(100);
		}
		const settledPath = await drive.evaluate(`() => location.pathname`);
		check(
			settledPath.startsWith(orgPath(f, 'orgB')) && !staleFeedback,
			'Late Organization A mutation shows no stale feedback toast in B',
			{ path: settledPath, staleFeedback }
		);
		check(
			settledForeign.includes('Foreign Private Status') &&
				!settledForeign.includes('Verification Leave') &&
				!settledForeign.includes(mutationMarker) &&
				(await rows('availability_entries')).some((entry) => entry.note === mutationMarker) &&
				(await rows('availability_entries', 'orgB')).every((entry) => entry.note !== mutationMarker),
			'Released A mutation response cannot restore A data or feedback into B; persisted A row remains scoped',
			{
				path: settledPath,
				foreign: settledForeign.includes('Foreign Private Status'),
				oldStatus: settledForeign.includes('Verification Leave'),
				oldMutation: settledForeign.includes(mutationMarker),
				matches: settledForeign
					.split('\n')
					.filter((line) => /Foreign Private Status|Verification Leave|Pending scoped availability/.test(line))
					.slice(0, 12)
			}
		);
		await h.reload();
		check(!(await drive.snapshot()).includes(mutationMarker), 'Reloaded Organization B excludes the A mutation');
	} finally {
		await drive.evaluate(`() => {
			const barrier = window.__verifyCalendarMutationBarrier;
			if (barrier?.release) barrier.release();
			if (barrier?.original) window.fetch = barrier.original;
			return true;
		}`);
		checked(
			await service.from('availability_entries').delete().eq('organization_id', ids.orgA).eq('note', mutationMarker)
		);
	}
	await open(`${orgPath(f)}/calendar`, ['Calendar']);
	const membership = checked(
		await service
			.from('organization_memberships')
			.select('id,capability_overrides')
			.eq('organization_id', ids.orgA)
			.eq('user_id', f.actors.calendarSwitch.id)
			.single()
	);
	try {
		const narrower = { ...membership.capability_overrides, calendar: 'none' };
		checked(
			await service.from('organization_memberships').update({ capability_overrides: narrower }).eq('id', membership.id)
		);
		const afterNarrowing = await request(
			'GET',
			`${orgPath(f)}/api/calendar-range?rangeStart=${dates.start}&rangeEnd=${dates.end}`
		);
		check(
			denied(afterNarrowing.status) && !afterNarrowing.body.includes(ids.availabilityAlpha),
			'Permission narrowing denies the already-open Calendar session and discloses no prior rows',
			{ status: afterNarrowing.status }
		);
		await h.reload();
		const reloaded = await drive.snapshot();
		check(
			!reloaded.includes('Verification Leave'),
			'Reload after permission narrowing clears inaccessible Calendar labels'
		);
		check(
			(await rows('availability_entries')).some((row) => row.id === ids.availabilityHistorical),
			'Permission narrowing does not alter historical persisted availability'
		);
	} finally {
		checked(
			await service
				.from('organization_memberships')
				.update({ capability_overrides: membership.capability_overrides })
				.eq('id', membership.id)
		);
	}
}

export async function proveCalendarClaim(claim, { drive, service, fixture }) {
	const observations = [];
	const h = harness(drive, service, fixture, observations);
	const checks = {
		'calendar-availability-lifecycle': checkAvailabilityLifecycle,
		'calendar-availability-bulk': checkAvailabilityBulk,
		'calendar-availability-scope': checkAvailabilityScope,
		'calendar-status-type-lifecycle': checkStatusTypeLifecycle,
		'calendar-assignment-type-lifecycle': checkAssignmentTypeLifecycle,
		'calendar-special-day-lifecycle': checkSpecialDayLifecycle,
		'calendar-catalog-authorization': checkCatalogAuthorization,
		'calendar-availability-consumers': checkAvailabilityConsumers,
		'calendar-state-isolation': checkStateIsolation
	};
	const scope = {
		roles: 'Calendar synthetic actors',
		organizationIds: [fixture.ids.orgA, fixture.ids.orgB],
		groupIds: [fixture.ids.groupA, fixture.ids.groupB]
	};
	try {
		const check = checks[claim];
		if (!check) throw new Blocked('MISSING_COVERAGE', `Calendar check ${claim} has not been implemented.`);
		await check({ drive, service, fixture, h });
		return { status: observations.every((item) => item.observed) ? 'PASS' : 'FAIL', claim, scope, observations };
	} catch (error) {
		return {
			status: observations.some((item) => !item.observed) ? 'FAIL' : 'INCONCLUSIVE',
			claim,
			scope,
			code: error.code ?? 'HARNESS',
			message: error.message,
			observations
		};
	}
}
