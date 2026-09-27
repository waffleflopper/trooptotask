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

function harness(drive, service, fixture, observations) {
	const check = (condition, expected, actual = undefined) => {
		observations.push({ expected, observed: !!condition, ...(actual === undefined ? {} : { actual }) });
	};
	const rows = async (table, org = 'orgA', columns = '*') =>
		checked(await service.from(table).select(columns).eq('organization_id', fixture.ids[org]));
	const row = async (table, id, org = 'orgA') => (await rows(table, org)).find((item) => item.id === id);
	const request = async (method, path, body) => parseResponse(await drive.request(method, path, body));
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
		const source = await drive.snapshot();
		const matches = source
			.split('\n')
			.filter((line) => /uid=/.test(line) && line.includes('button') && line.includes(label));
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
		clickButton,
		fill,
		rowAction,
		section,
		setInput,
		personCell
	};
}

async function checkAvailabilityScope(ctx) {
	const { fixture: f, h } = ctx;
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
	const { check, login, clickButton, fill, setInput, rowAction, waitRow, row, rows, request } = h;
	const freshName = name('Verification New Status');
	await login('calendarConfigure', 'calendar/settings', ['Calendar Settings']);
	await clickButton('Add new');
	await fill('Status name', freshName);
	await clickButton('Add Status Type');
	const created = await waitRow('status_types', (item) => item.name === freshName);
	check(!!created && created.organization_id === f.ids.orgA, 'Settings add creates one Organization A status', {
		id: created?.id
	});
	await drive.tool('navigate_page', { type: 'reload' });
	check((await drive.snapshot()).includes(freshName), 'Created status remains in settings after reload');
	const before = await row('status_types', f.ids.statusLeave);
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
	await drive.tool('navigate_page', { type: 'reload' });
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
	const audit = checked(await ctx.service.from('audit_logs').select('action,resource_id').eq('org_id', f.ids.orgA));
	const notifications = await rows('notifications');
	check(
		audit.some((event) => event.action === 'status_type.deleted' && event.resource_id === f.ids.statusDelete) &&
			notifications.some((item) => item.type === 'config_type_deleted' && item.title === 'Status Type Deleted'),
		'Status deletion records audit and administrator notification effects'
	);
	await login('calendarView');
	const rejectedName = name('Denied update');
	const deniedUpdate = await request('PUT', `${orgPath(f)}/api/status-types`, {
		id: f.ids.statusLeave,
		name: rejectedName
	});
	check(
		denied(deniedUpdate.status) && (await row('status_types', f.ids.statusLeave))?.name === 'Verification Leave Edited',
		'Viewer update is denied without a misleading persisted change',
		{ status: deniedUpdate.status }
	);
}

async function checkAssignmentTypeLifecycle(ctx) {
	const { fixture: f, drive, h } = ctx;
	const { check, login, clickButton, fill, setInput, section, rowAction, waitRow, row, rows, request } = h;
	await login('calendarConfigure', 'calendar/settings', ['Calendar Settings']);
	await section('Assignment Types');
	const personName = name('Verification New Person Duty');
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
	const groupName = name('Verification New Group Duty');
	await clickButton('Add new');
	await fill('Full name', groupName);
	await fill('Short code', 'VGN');
	await setInput('#add-assign-to', 'group');
	await clickButton('Add Assignment Type');
	const createdGroup = await waitRow('assignment_types', (item) => item.name === groupName);
	check(!!createdGroup && createdGroup.assign_to === 'group', 'Settings creates a Group-targeted assignment type', {
		id: createdGroup?.id
	});
	const before = await row('assignment_types', f.ids.typePersonnel);
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
	await drive.tool('navigate_page', { type: 'reload' });
	await section('Assignment Types');
	const reloaded = await drive.snapshot();
	check(
		reloaded.includes('Verification Staff Duty Edited') && !reloaded.includes('Verification Archived Duty'),
		'Reloaded settings shows edited active type and excludes archived type from editable choices'
	);
	await rowAction('Delete assignment type', 'Verification Retiring Duty');
	check(
		(await drive.snapshot()).includes('All assignments using this type will also be removed'),
		'Deletion warns about affected assignments'
	);
	await clickButton('Delete');
	for (let attempt = 0; attempt < 30 && (await row('assignment_types', f.ids.typeDelete)); attempt++) await sleep(100);
	check(
		!(await row('assignment_types', f.ids.typeDelete)) &&
			!(await row('daily_assignments', f.ids.assignmentDelete)) &&
			!!(await row('daily_assignments', f.ids.assignmentPersonnel)) &&
			!!(await row('assignment_types', f.ids.typeArchived)) &&
			!!(await row('daily_assignments', f.ids.assignmentArchived)),
		'Confirmed ordinary type deletion removes only linked assignments and retains unrelated and archived history'
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
		notification.some((item) => item.type === 'config_type_deleted' && item.title === 'Assignment Type Deleted'),
		'Assignment type deletion notifies administrators'
	);
}

async function checkAvailabilityLifecycle(ctx) {
	const { fixture: f, drive, h, service } = ctx;
	const { check, login, clickButton, fill, personCell, waitRow, row, rows } = h;
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
	const deniedMarker = name('Failure feedback');
	checked(
		await service
			.from('organization_memberships')
			.update({ capability_overrides: { ...membership.capability_overrides, calendar: 'view' } })
			.eq('id', membership.id)
	);
	await fill('Note', deniedMarker);
	await clickButton('Add Status');
	await sleep(400);
	const failedSnapshot = await drive.snapshot();
	const failedRows = (await rows('availability_entries')).filter((entry) => entry.note === deniedMarker);
	check(
		failedRows.length === 0 &&
			!failedSnapshot.includes('added —') &&
			/failed|error|unable|denied|permission/i.test(failedSnapshot),
		'Failed save restores accurate state, shows an error, and emits no success before persistence',
		{
			saved: failedRows.length,
			successVisible: failedSnapshot.includes('added —'),
			errorVisible: /failed|error|unable|denied|permission/i.test(failedSnapshot)
		}
	);
	checked(
		await service
			.from('organization_memberships')
			.update({ capability_overrides: membership.capability_overrides })
			.eq('id', membership.id)
	);
	await drive.tool('navigate_page', { type: 'reload' });
	await personCell('Able, Synthetic', day);
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
	await drive.tool('navigate_page', { type: 'reload' });
	await personCell('Able, Synthetic', day);
	check((await drive.snapshot()).includes(addMarker), 'Saved availability survives full Calendar reload');
	await clickButton('Edit status');
	const editedMarker = name('Edited availability');
	await fill('Note', editedMarker);
	await clickButton('Update Status');
	const replacement = await waitRow('availability_entries', (entry) => entry.note === editedMarker);
	check(
		!!replacement &&
			replacement.id !== created?.id &&
			replacement.personnel_id === f.ids.personA &&
			replacement.status_type_id === f.ids.statusLeave &&
			replacement.start_date === f.dates.ui &&
			replacement.end_date === f.dates.ui &&
			!(await row('availability_entries', created?.id)),
		'Existing edit flow replaces the row with exactly the chosen saved fields',
		{ replacement }
	);
	await drive.tool('navigate_page', { type: 'reload' });
	await personCell('Able, Synthetic', day);
	check((await drive.snapshot()).includes(editedMarker), 'Replacement survives full Calendar reload');
	await clickButton('Remove status');
	check((await drive.snapshot()).includes('Remove this status entry'), 'Removal asks for explicit confirmation');
	await clickButton('Remove');
	for (let attempt = 0; attempt < 30 && (await row('availability_entries', replacement?.id)); attempt++)
		await sleep(100);
	check(
		!(await row('availability_entries', replacement?.id)) &&
			(await row('availability_entries', f.ids.availabilityHistorical))?.note === 'Historical retained',
		'Removal persists while unrelated historical availability remains unchanged'
	);
	await drive.tool('navigate_page', { type: 'reload' });
	await personCell('Able, Synthetic', day);
	check(!(await drive.snapshot()).includes(editedMarker), 'Removed availability remains absent after reload');
}

async function checkSpecialDayLifecycle(ctx) {
	const { fixture: f, drive, h, service } = ctx;
	const { check, login, request, row, rows, open, section, rowAction, clickButton, fill, waitRow } = h;
	await login('calendarConfigure', 'calendar/settings', ['Calendar Settings']);
	await section('Closures');
	const addedName = name('Verification Added Closure');
	await clickButton('Add new');
	await fill('Name', addedName);
	await clickButton('Add Closure');
	const createdRow = await waitRow('special_days', (day) => day.name === addedName);
	check(
		!!createdRow && createdRow.date === f.dates.ui && createdRow.type === 'org-closure',
		'Settings closure creation persists the selected default local date and name',
		{ date: createdRow?.date, id: createdRow?.id }
	);
	await drive.tool('navigate_page', { type: 'reload' });
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
		const failed = await drive.snapshot();
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
	await drive.tool('navigate_page', { type: 'reload' });
	await section('Closures');
	await rowAction('Edit closure', addedName);
	const editedName = name('Verification Edited Closure');
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
	const expected2026 = [
		['2026-01-01', "New Year's Day"],
		['2026-01-19', 'Martin Luther King Jr. Day'],
		['2026-02-16', 'Presidents Day'],
		['2026-05-25', 'Memorial Day'],
		['2026-06-19', 'Juneteenth'],
		['2026-07-03', 'Independence Day'],
		['2026-09-07', 'Labor Day'],
		['2026-10-12', 'Columbus Day'],
		['2026-11-11', 'Veterans Day'],
		['2026-11-26', 'Thanksgiving Day'],
		['2026-12-25', 'Christmas Day']
	];
	for (let attempt = 0; attempt < 30 && (await row('special_days', f.ids.holidayCustom)); attempt++) await sleep(100);
	const days = await rows('special_days');
	const foreignDays = await rows('special_days', 'orgB');
	check(
		expected2026.every(([date, label]) =>
			days.some((day) => day.date === date && day.name === label && day.type === 'federal-holiday')
		) &&
			!days.some((day) => day.id === f.ids.holidayCustom) &&
			days.some((day) => day.id === f.ids.closureA) &&
			foreignDays.some((day) => day.id === f.ids.closureB),
		'Independently specified 2026 holidays replace custom federal rows while local and foreign closures persist',
		{
			expected2026,
			observed2026: days
				.filter((day) => day.type === 'federal-holiday' && day.date.startsWith('2026'))
				.map((day) => [day.date, day.name])
		}
	);
	await drive.tool('navigate_page', { type: 'reload' });
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
	await drive.tool('navigate_page', { type: 'reload' });
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
		second.status >= 400 &&
			(await rows('availability_entries')).filter((entry) => entry.note === marker).length === 2 &&
			(await rows('availability_entries')).every((entry) => entry.note !== failedMarker),
		'A later failed batch does not erase the earlier successful batch or pretend the failed row saved',
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
		await drive.tool('navigate_page', { type: 'reload' });
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
				? [
						ids.availabilityHistorical,
						ids.availabilityAlpha,
						ids.availabilityBravo,
						ids.availabilityCurrent,
						ids.availabilityUnassigned
					]
				: [ids.availabilityAlpha, ids.availabilityBravo, ids.availabilityUnassigned];
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
				statusDays('Baker', 'Verification Training') === 4 &&
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
	const calendarPage = await open(`${orgPath(f)}/calendar`, ['Calendar']);
	check(
		calendarPage.includes('Verification Leave') && !calendarPage.includes('Foreign Private Status'),
		'Calendar surface shows its saved status label, not the foreign label'
	);
	const dashboard = await open(`${orgPath(f)}`, ['Dashboard', 'Overview']);
	check(
		dashboard.includes('Verification Training') &&
			dashboard.includes('1 out') &&
			!dashboard.includes('Foreign Private Status') &&
			!dashboard.includes('Foreign, Synthetic'),
		'Dashboard projects Baker’s current saved training status as one unavailable Person without foreign facts'
	);
	await drive.tool('navigate_page', { type: 'reload' });
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
		await h.clickButton('3-Month');
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
	const membership = checked(
		await service
			.from('organization_memberships')
			.select('id,capability_overrides')
			.eq('organization_id', ids.orgA)
			.eq('user_id', f.actors.calendarSwitch.id)
			.single()
	);
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
	await drive.tool('navigate_page', { type: 'reload' });
	const reloaded = await drive.snapshot();
	check(
		!reloaded.includes('Verification Leave'),
		'Reload after permission narrowing clears inaccessible Calendar labels'
	);
	check(
		(await rows('availability_entries')).some((row) => row.id === ids.availabilityHistorical),
		'Permission narrowing does not alter historical persisted availability'
	);
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
			status: 'INCONCLUSIVE',
			claim,
			scope,
			code: error.code ?? 'HARNESS',
			message: error.message,
			observations
		};
	}
}
