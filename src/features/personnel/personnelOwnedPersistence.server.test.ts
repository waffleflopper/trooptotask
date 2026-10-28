import { describe, expect, it } from 'vitest';
import { personnelProvider } from './test-support/personnelProvider.server';
import { createSupabaseRankCatalogPersistence } from './supabaseRankCatalogPersistence.server';
import {
	createSupabasePersonnelSheetPersistence,
	createSupabasePersonnelWorkbookHistoryReader
} from './supabasePersonnelSheetPersistence.server';
import { createSupabasePersonnelArtifactReadPersistence } from './supabasePersonnelArtifactReadPersistence.server';
import { createSupabasePersonnelArtifactWritePort } from './artifactWrites.server';
import type { PersonnelArtifactWriter } from './contracts';
import { PersonnelDodIdConflict } from './personnelSheetPersistence';
import type { ActorStamp } from './personnelArtifactPersistence';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';

const rank = {
	id: 'rank-a',
	organization_id: 'org-a',
	code: 'CUSTOM',
	label: 'Custom rank',
	service: 'custom',
	category: 'custom',
	pay_grade: 'ungraded',
	state: 'active',
	source: 'custom',
	sort_order: 3,
	created_at: '2020-01-01T00:00:00.123456Z',
	updated_at: null
} as const;
const sheet = {
	dod_id: '0123456789',
	id: 'sheet-a',
	personnel_id: 'person-a',
	organization_id: 'org-a',
	blood_type: 'O+',
	basd: '2012-01-02',
	date_of_rank: '2025-04-05',
	marital_status: 'Married',
	marital_status_date: '2018-05-06',
	number_of_dependents: 2,
	children: [{ name: 'Alex', age: 7 }],
	civilian_education: 'BS',
	military_education: ['BLS'],
	emergency_contact_name: 'Sam',
	emergency_contact_relationship: 'Sibling',
	emergency_contact_phone: '555-0101',
	spouse_name: 'Jamie',
	spouse_phone: '555-0102',
	vehicle_make_model: 'Car',
	vehicle_plate: 'ABC',
	vehicle_color: 'Blue',
	personal_email: 'alex@example.invalid',
	personal_phone: '555-0103',
	address_street: '1 Test Street',
	address_city: 'Test City',
	address_state: 'AK',
	address_zip: '99501',
	updated_by: 'user-a',
	created_at: '2020-01-01T00:00:00.123456Z',
	updated_at: null
};
const counseling = {
	id: 'counsel-a',
	personnel_id: 'person-a',
	date_conducted: '2026-10-07',
	title: 'Session',
	subject: 'Session',
	summary: null,
	notes: null,
	conducted_by: null,
	uploaded_by: 'user-a',
	file_path: 'bound.pdf',
	created_at: '2026-10-08T12:00:00.123456Z',
	archived_at: null
};
const document = {
	id: 'doc-a',
	personnel_id: 'person-a',
	title: 'Form',
	file_path: 'bound.pdf',
	file_size_bytes: 4159,
	content_type: 'application/pdf',
	uploaded_by: 'user-a',
	created_at: '2026-10-08T12:00:00.123456Z',
	archived_at: null
};
const followUp = {
	id: 'follow-a',
	personnel_id: 'person-a',
	title: 'Review',
	notes: null,
	due_date: '2026-11-01',
	status: 'open',
	created_by: 'user-a',
	created_at: '2026-10-08T12:00:00.123456Z',
	updated_at: '2026-10-08T12:00:00.123456Z',
	completed_at: null,
	archived_at: null
};

const note = {
	id: 'note-a',
	personnel_id: 'person-a',
	author: 'user-a',
	text: 'Literal note',
	created_at: '2026-10-08T12:00:00.123456Z',
	updated_at: '2026-10-08T12:00:00.123456Z',
	archived_at: null
};

const actor = () =>
	createTestAuthContext({
		orgId: 'org-a',
		userId: 'user-a',
		role: 'member',
		isPrivileged: false,
		scopeSet: { kind: 'groups', groupIds: ['alpha'] },
		capabilityMap: {
			calendar: 'none',
			personnel: 'configure',
			training: 'none',
			criticalTasks: 'none',
			onboarding: 'none',
			ratingScheme: 'none'
		}
	});

const artifactWrites = [
	{
		name: 'counseling',
		table: 'counseling_records',
		saved: counseling,
		create: (w: PersonnelArtifactWriter) =>
			w.createCounseling({
				dateConducted: '2026-10-07',
				title: 'Session',
				summary: null,
				conductedBy: null,
				uploadedBy: 'user-a',
				filePath: 'bound.pdf',
				createdAt: '2026-10-08T12:00:00.123456Z'
			}),
		find: (w: PersonnelArtifactWriter, id: string) => w.findCounseling(id),
		archive: (w: PersonnelArtifactWriter, id: string, by: ActorStamp | null) => w.setCounselingArchive(id, by),
		remove: null
	},
	{
		name: 'document',
		table: 'personnel_documents',
		saved: document,
		create: (w: PersonnelArtifactWriter) =>
			w.createDocument({
				title: 'Form',
				filePath: 'bound.pdf',
				fileSizeBytes: 4159,
				contentType: 'application/pdf',
				uploadedBy: 'user-a',
				createdAt: '2026-10-08T12:00:00.123456Z'
			}),
		find: (w: PersonnelArtifactWriter, id: string) => w.findDocument(id),
		archive: (w: PersonnelArtifactWriter, id: string, by: ActorStamp | null) => w.setDocumentArchive(id, by),
		remove: null
	},
	{
		name: 'follow-up',
		table: 'personnel_follow_ups',
		saved: followUp,
		create: (w: PersonnelArtifactWriter) =>
			w.createFollowUp({
				title: 'Review',
				notes: null,
				dueDate: '2026-11-01',
				createdBy: 'user-a',
				createdAt: '2026-10-08T12:00:00.123456Z',
				updatedAt: '2026-10-08T12:00:00.123456Z'
			}),
		find: (w: PersonnelArtifactWriter, id: string) => w.findFollowUp(id),
		archive: (w: PersonnelArtifactWriter, id: string, by: ActorStamp | null) =>
			w.patchFollowUp(id, { archived: by, updatedAt: '2026-10-08T12:00:00.123456Z' }),
		remove: (w: PersonnelArtifactWriter, id: string) => w.deleteFollowUp(id)
	},
	{
		name: 'leader note',
		table: 'leader_notes',
		saved: note,
		create: (w: PersonnelArtifactWriter) =>
			w.createLeaderNote({ author: 'user-a', text: 'Literal note', createdAt: '2026-10-08T12:00:00.123456Z' }),
		find: (w: PersonnelArtifactWriter, id: string) => w.findLeaderNote(id),
		archive: (w: PersonnelArtifactWriter, id: string, by: ActorStamp | null) => w.setLeaderNoteArchive(id, by),
		remove: (w: PersonnelArtifactWriter, id: string) => w.deleteLeaderNote(id)
	}
] as const;

describe('finite Personnel artifact SDK writes', () => {
	it.each(artifactWrites)(
		'$name keeps saved values and unrelated rows through create, archive, restore and delete',
		async (c) => {
			const ordinary = personnelProvider({
				personnel: [{ id: 'person-a', organization_id: 'org-a', group_id: 'alpha' }]
			});
			const witnesses = [
				{ ...c.saved, id: 'foreign', organization_id: 'org-b', retained_metadata: 'foreign' },
				{
					...c.saved,
					id: 'other-person',
					personnel_id: 'person-b',
					organization_id: 'org-a',
					retained_metadata: 'sibling'
				}
			];
			const service = personnelProvider({ [c.table]: witnesses });
			let opened = 0;
			const port = createSupabasePersonnelArtifactWritePort(ordinary.client, () => {
				opened++;
				return service.client;
			});
			expect(opened).toBe(0);
			const writer = await port.forPerson(actor(), 'person-a');
			expect(opened).toBe(1);
			const expected = { ...c.saved, id: 'saved-1' };
			expect(await c.create(writer)).toEqual(expected);
			expect(await c.find(writer, 'foreign')).toBeNull();
			expect(await c.find(writer, 'other-person')).toBeNull();
			expect(await c.archive(writer, 'saved-1', { at: '2026-10-09T10:00:00Z', by: 'user-b' })).toEqual({
				...expected,
				archived_at: '2026-10-09T10:00:00Z',
				archived_by: 'user-b'
			});
			expect(await c.archive(writer, 'saved-1', null)).toEqual({ ...expected, archived_by: null });
			const persisted = service.state.rows[c.table].find((r) => r.id === 'saved-1');
			expect(persisted).toMatchObject({ organization_id: 'org-a', personnel_id: 'person-a' });
			expect(service.state.rows[c.table].filter((r) => r.id !== 'saved-1')).toEqual(witnesses);
			if (c.remove) {
				await c.remove(writer, 'saved-1');
				expect(await c.find(writer, 'saved-1')).toBeNull();
				expect(service.state.rows[c.table]).toEqual(witnesses);
			}
			service.state.failure = () => ({ code: '42501', message: 'Artifact write denied', status: 403 });
			await expect(c.create(writer)).rejects.toThrow('Artifact write denied');
			await expect(c.archive(writer, 'foreign', null)).rejects.toThrow('Artifact write denied');
			if (c.remove) await expect(c.remove(writer, 'foreign')).rejects.toThrow('Artifact write denied');
			expect(service.state.rows[c.table].filter((r) => r.id !== 'saved-1')).toEqual(witnesses);
		}
	);
	it('denies missing and out-of-Group parents before privileged construction', async () => {
		const ordinary = personnelProvider({
			personnel: [
				{ id: 'other', organization_id: 'org-a', group_id: 'bravo' },
				{ id: 'foreign', organization_id: 'org-b', group_id: 'alpha' }
			]
		});
		let opened = 0;
		const port = createSupabasePersonnelArtifactWritePort(ordinary.client, () => {
			opened++;
			return ordinary.client;
		});
		await expect(port.forPerson(actor(), 'other')).rejects.toMatchObject({ status: 403 });
		await expect(port.forPerson(actor(), 'foreign')).rejects.toMatchObject({ status: 404 });
		expect(opened).toBe(0);
	});
});

const readCases = [
	{
		name: 'rank catalog',
		table: 'organization_rank_catalog',
		saved: rank,
		read: (p: ReturnType<typeof personnelProvider>) =>
			createSupabaseRankCatalogPersistence(p.client, 'org-a').listEntries(),
		expected: rank
	},
	{
		name: 'SDS',
		table: 'personnel_extended_info',
		saved: sheet,
		read: (p: ReturnType<typeof personnelProvider>) =>
			createSupabasePersonnelSheetPersistence(p.client, 'org-a').listSheetsForPerson('person-a'),
		expected: sheet
	},
	{
		name: 'counseling',
		table: 'counseling_records',
		saved: counseling,
		read: (p: ReturnType<typeof personnelProvider>) =>
			createSupabasePersonnelArtifactReadPersistence(p.client, 'org-a').listCounselingRecords('person-a', {
				archived: false
			}),
		expected: counseling
	},
	{
		name: 'documents',
		table: 'personnel_documents',
		saved: document,
		read: (p: ReturnType<typeof personnelProvider>) =>
			createSupabasePersonnelArtifactReadPersistence(p.client, 'org-a').listDocuments('person-a', { archived: false }),
		expected: document
	},
	{
		name: 'follow-ups',
		table: 'personnel_follow_ups',
		saved: followUp,
		read: (p: ReturnType<typeof personnelProvider>) =>
			createSupabasePersonnelArtifactReadPersistence(p.client, 'org-a').listFollowUps('person-a', { archived: false }),
		expected: followUp
	},
	{
		name: 'workbook counseling',
		table: 'counseling_records',
		saved: { ...counseling, key_points: 'Goal', plan_of_action: 'Plan', status: 'completed', follow_up_date: null },
		read: (p: ReturnType<typeof personnelProvider>) =>
			createSupabasePersonnelWorkbookHistoryReader(p.client, 'org-a').listCounselingExportFacts('person-a'),
		expected: {
			date_conducted: '2026-10-07',
			subject: 'Session',
			key_points: 'Goal',
			plan_of_action: 'Plan',
			status: 'completed',
			follow_up_date: null,
			notes: null
		}
	},
	{
		name: 'workbook contacts',
		table: 'personnel_extended_info',
		saved: sheet,
		read: (p: ReturnType<typeof personnelProvider>) =>
			createSupabasePersonnelWorkbookHistoryReader(p.client, 'org-a').listExtendedInfoExportFacts('person-a'),
		expected: {
			emergency_contact_name: 'Sam',
			emergency_contact_relationship: 'Sibling',
			emergency_contact_phone: '555-0101',
			spouse_name: 'Jamie',
			spouse_phone: '555-0102',
			vehicle_make_model: 'Car',
			vehicle_plate: 'ABC',
			vehicle_color: 'Blue',
			personal_email: 'alex@example.invalid',
			personal_phone: '555-0103',
			address_street: '1 Test Street',
			address_city: 'Test City',
			address_state: 'AK',
			address_zip: '99501'
		}
	}
] as const;

describe('finite Personnel ordinary provider contracts', () => {
	it.each(readCases)('$name retains its complete result under physical page drift', async (c) => {
		const rows = Array.from({ length: 1001 }, (_, i) => ({
			...c.saved,
			id: `saved-${String(i).padStart(4, '0')}`,
			organization_id: 'org-a',
			private_metadata: 'never-public'
		}));
		const p = personnelProvider({
			[c.table]: [
				...rows,
				{ ...c.saved, id: 'foreign', organization_id: 'org-b' },
				{ ...c.saved, id: 'other-person', organization_id: 'org-a', personnel_id: 'person-b' }
			]
		});
		if (c.table === 'organization_rank_catalog')
			p.state.rows.organization_rank_catalog = p.state.rows.organization_rank_catalog.filter(
				(r) => r.id !== 'other-person'
			);
		p.state.unstablePages = true;
		const actual = await c.read(p);
		expect(actual).toEqual(rows.map((r) => ('id' in c.expected ? { ...c.expected, id: r.id } : c.expected)));
		expect(actual[0]).not.toHaveProperty('private_metadata');
	});
	it.each(readCases)('$name handles exact page boundaries, null data and first or late provider errors', async (c) => {
		const p = personnelProvider({
			[c.table]: Array.from({ length: 1000 }, (_, i) => ({
				...c.saved,
				id: `saved-${String(i).padStart(4, '0')}`,
				organization_id: 'org-a'
			}))
		});
		expect((await c.read(p)).length).toBe(1000);
		p.state.rows[c.table].push({ ...c.saved, id: 'saved-1000', organization_id: 'org-a' });
		p.state.failure = (r) => (r.offset >= 1000 ? { code: '42501', message: 'Late read denied', status: 403 } : null);
		await expect(c.read(p)).rejects.toThrow('Late read denied');
		p.state.failure = () => ({ code: 'XX000', message: 'First read failed', status: 500 });
		await expect(c.read(p)).rejects.toThrow('First read failed');
		p.state.failure = null;
		p.state.nullData = true;
		expect(await c.read(p)).toEqual([]);
	});
	it('rank saves preserve saved identity and timestamps while excluding unconsumed fields', async () => {
		const p = personnelProvider({ organization_rank_catalog: [{ ...rank, retained_metadata: { old: true } }] });
		const port = createSupabaseRankCatalogPersistence(p.client, 'org-a');
		expect(await port.findEntryByCode('CUSTOM')).toEqual(rank);
		expect(await port.findEntryByCode('missing')).toBeNull();
		const values = {
			code: 'CUSTOM',
			label: 'Renamed',
			service: 'custom',
			category: 'custom',
			pay_grade: 'ungraded',
			state: 'retired',
			source: 'custom',
			sort_order: 7
		} as const;
		expect(await port.saveEntries([values])).toEqual([{ ...rank, ...values }]);
		expect(p.state.rows.organization_rank_catalog).toEqual([{ ...rank, ...values, retained_metadata: { old: true } }]);
		expect(await port.patchEntryById('rank-a', { ...values, label: 'Final' })).toEqual(
			[{ ...rank, ...values, label: 'Final' }][0]
		);
		expect(await port.saveEntries([])).toEqual([]);
		p.state.failure = () => ({ code: '42501', message: 'Rank write denied', status: 403 });
		await expect(port.findEntryByCode('CUSTOM')).rejects.toThrow('Rank write denied');
		await expect(port.saveEntries([values])).rejects.toThrow('Rank write denied');
		await expect(port.patchEntryById('rank-a', values)).rejects.toThrow('Rank write denied');
	});
	it('rank state updates retain details and affect only differing target codes in the Organization', async () => {
		const p = personnelProvider({
			organization_rank_catalog: [
				{ ...rank, label: 'Saved name', sort_order: 42 },
				{ ...rank, id: 'already-off', code: 'OFF', state: 'retired' },
				{ ...rank, id: 'untargeted', code: 'OTHER' },
				{ ...rank, id: 'foreign', organization_id: 'org-b' }
			]
		});
		const port = createSupabaseRankCatalogPersistence(p.client, 'org-a');

		expect(await port.setStatesByCodes(['CUSTOM', 'OFF', 'REMOVED'], 'retired')).toEqual([
			{ ...rank, label: 'Saved name', sort_order: 42, state: 'retired' }
		]);
		expect(p.state.rows.organization_rank_catalog).toEqual([
			{ ...rank, label: 'Saved name', sort_order: 42, state: 'retired' },
			{ ...rank, id: 'already-off', code: 'OFF', state: 'retired' },
			{ ...rank, id: 'untargeted', code: 'OTHER' },
			{ ...rank, id: 'foreign', organization_id: 'org-b' }
		]);
		expect(await port.setStatesByCodes(['CUSTOM'], 'retired')).toEqual([]);
		expect(await port.setStatesByCodes([], 'active')).toEqual([]);
		p.state.failure = () => ({ code: '42501', message: 'Rank write denied', status: 403 });
		await expect(port.setStatesByCodes(['CUSTOM'], 'active')).rejects.toThrow('Rank write denied');
	});
	it('SDS replacement and acknowledgement retain all untouched saved fields and canonical organization', async () => {
		const p = personnelProvider({
			personnel_extended_info: [
				{ ...sheet, award_tracking_acknowledged_at: '2026-10-01T10:00:00Z', retained_metadata: 'history' }
			]
		});
		const port = createSupabasePersonnelSheetPersistence(p.client, 'org-a');
		expect(await port.findSheetForPerson('person-a')).toEqual(sheet);
		expect(await port.findSheetForPerson('missing')).toBeNull();
		const values = {
			...sheet,
			dod_id: null,
			personal_phone: null,
			organization_id: 'org-b',
			personnel_id: 'person-b',
			award_tracking_acknowledged_at: null,
			id: 'changed',
			created_at: 'changed'
		};
		expect(await port.replaceEditableSheetFields('sheet-a', values)).toEqual({
			...sheet,
			dod_id: null,
			personal_phone: null
		});
		await port.setAwardAcknowledgedAt('sheet-a', null);
		expect(p.state.rows.personnel_extended_info).toEqual([
			{
				...sheet,
				dod_id: null,
				personal_phone: null,
				award_tracking_acknowledged_at: null,
				retained_metadata: 'history'
			}
		]);
		expect(await port.createSheet('person-new', { award_tracking_acknowledged_at: '2026-10-08T12:00:00Z' })).toEqual({
			id: 'saved-1',
			personnel_id: 'person-new',
			organization_id: 'org-a',
			created_at: '2026-10-08T12:00:00.123456Z'
		});
		await expect(port.createSheet('person-with-dod', sheet)).resolves.toMatchObject({ dod_id: '0123456789' });
		p.state.failure = () => ({ code: '42501', message: 'Sheet denied', status: 403 });
		await expect(port.findSheetForPerson('person-a')).rejects.toThrow('Sheet denied');
		await expect(port.createSheet('person-new', values)).rejects.toThrow('Sheet denied');
		await expect(port.replaceEditableSheetFields('sheet-a', values)).rejects.toThrow('Sheet denied');
		await expect(port.setAwardAcknowledgedAt('sheet-a', null)).rejects.toThrow('Sheet denied');
	});
	it('maps a DoD ID uniqueness rejection on insert and replacement without treating other conflicts as DoD IDs', async () => {
		const p = personnelProvider();
		const port = createSupabasePersonnelSheetPersistence(p.client, 'org-a');
		p.state.failure = () => ({
			code: '23505',
			status: 409,
			message: 'duplicate key value violates unique constraint "personnel_extended_info_organization_dod_id_key"'
		});
		await expect(port.createSheet('person-a', sheet)).rejects.toBeInstanceOf(PersonnelDodIdConflict);
		await expect(port.replaceEditableSheetFields('sheet-a', sheet)).rejects.toBeInstanceOf(PersonnelDodIdConflict);
		p.state.failure = () => ({ code: '23505', status: 409, message: 'duplicate key violates another index' });
		await expect(port.createSheet('person-a', sheet)).rejects.toThrow('duplicate key violates another index');
	});
	it('artifact archived state, primary sorting and limited results remain distinct', async () => {
		const p = personnelProvider({
			counseling_records: [
				{ ...counseling, id: 'c-older', organization_id: 'org-a', date_conducted: '2026-10-06' },
				{ ...counseling, organization_id: 'org-a' },
				{ ...counseling, id: 'c-archived', organization_id: 'org-a', archived_at: '2026-10-08' }
			],
			personnel_documents: [
				{ ...document, organization_id: 'org-a' },
				{ ...document, id: 'd-archived', organization_id: 'org-a', archived_at: '2026-10-08' }
			],
			personnel_follow_ups: [
				{ ...followUp, organization_id: 'org-a' },
				{ ...followUp, id: 'f-completed', organization_id: 'org-a', status: 'completed' },
				{ ...followUp, id: 'f-archived', organization_id: 'org-a', status: 'archived', archived_at: '2026-10-08' }
			]
		});
		const port = createSupabasePersonnelArtifactReadPersistence(p.client, 'org-a');
		expect(await port.listCounselingRecords('person-a', { archived: false, limit: 1 })).toEqual([counseling]);
		expect(
			await port.listCounselingRecords('person-a', { archived: false, limit: 1, onOrBefore: '2026-10-06' })
		).toEqual([{ ...counseling, id: 'c-older', date_conducted: '2026-10-06' }]);
		expect(await port.listCounselingRecords('person-a', { archived: true })).toEqual([
			{ ...counseling, id: 'c-archived', archived_at: '2026-10-08' }
		]);
		expect(await port.listDocuments('person-a', { archived: true })).toEqual([
			{ ...document, id: 'd-archived', archived_at: '2026-10-08' }
		]);
		expect(await port.findDocument('person-a', 'doc-a')).toEqual(document);
		expect(await port.findDocument('person-b', 'doc-a')).toBeNull();
		expect(await port.listFollowUps('person-a', { archived: false })).toEqual([
			followUp,
			{ ...followUp, id: 'f-completed', status: 'completed' }
		]);
		expect(await port.listFollowUps('person-a', { archived: true })).toEqual([
			{ ...followUp, id: 'f-archived', status: 'archived', archived_at: '2026-10-08' }
		]);
		expect(await port.listOpenFollowUps('person-a', 5)).toEqual({ rows: [followUp], total: 1 });
		expect(await port.listDocuments('person-a', { archived: false, limit: 0 })).toEqual([]);
	});
	it('record counts take open follow-ups and every archived artifact of one Person in one Organization', async () => {
		const note = { personnel_id: 'person-a', organization_id: 'org-a', author: 'user-a', text: 'Note' };
		const p = personnelProvider({
			counseling_records: [
				{ ...counseling, organization_id: 'org-a' },
				{ ...counseling, id: 'c-archived', organization_id: 'org-a', archived_at: '2026-10-08' }
			],
			personnel_documents: [
				{ ...document, id: 'd-archived', organization_id: 'org-a', archived_at: '2026-10-08' },
				{ ...document, id: 'd-foreign', organization_id: 'org-b', archived_at: '2026-10-08' }
			],
			personnel_follow_ups: [
				{ ...followUp, organization_id: 'org-a' },
				{ ...followUp, id: 'f-other', organization_id: 'org-a', personnel_id: 'person-b' },
				{ ...followUp, id: 'f-completed', organization_id: 'org-a', status: 'completed' },
				{ ...followUp, id: 'f-archived', organization_id: 'org-a', status: 'archived', archived_at: '2026-10-08' }
			],
			leader_notes: [
				{ ...note, id: 'n-active', archived_at: null },
				{ ...note, id: 'n-archived', archived_at: '2026-10-09' }
			]
		});
		const port = createSupabasePersonnelArtifactReadPersistence(p.client, 'org-a');
		expect(await port.countRecords('person-a')).toEqual({ openFollowUps: 1, archived: 4 });
		p.state.failure = (request) =>
			request.table === 'leader_notes' ? { code: '42501', message: 'Notes denied', status: 403 } : null;
		await expect(port.countRecords('person-a')).rejects.toThrow('Notes denied');
	});
	it('leader pages retain microseconds, tied IDs and fill only with older notes', async () => {
		const note = {
			personnel_id: 'person-a',
			organization_id: 'org-a',
			author: 'user-a',
			text: 'Note',
			created_at: '2026-10-08T12:00:00.123456Z',
			archived_at: null
		};
		const p = personnelProvider({
			leader_notes: [
				{ ...note, id: 'd' },
				{ ...note, id: 'c' },
				{ ...note, id: 'b' },
				{ ...note, id: 'a', created_at: '2026-10-08T12:00:00.123455Z' },
				{ ...note, id: 'foreign', organization_id: 'org-b' },
				{ ...note, id: 'archived', archived_at: '2026-10-09' }
			]
		});
		const port = createSupabasePersonnelArtifactReadPersistence(p.client, 'org-a');
		const publicNote = {
			personnel_id: 'person-a',
			author: 'user-a',
			text: 'Note',
			created_at: '2026-10-08T12:00:00.123456Z',
			archived_at: null
		};
		expect(await port.listLeaderNotePage('person-a', { archived: false, limit: 2 })).toEqual([
			{ ...publicNote, id: 'd' },
			{ ...publicNote, id: 'c' }
		]);
		expect(
			await port.listLeaderNotePage('person-a', {
				archived: false,
				limit: 2,
				before: { createdAt: note.created_at, id: 'c' }
			})
		).toEqual([
			{ ...publicNote, id: 'b' },
			{ ...publicNote, id: 'a', created_at: '2026-10-08T12:00:00.123455Z' }
		]);
		expect(await port.listLeaderNotePage('person-a', { archived: true, limit: 2 })).toEqual([
			{ ...publicNote, id: 'archived', archived_at: '2026-10-09' }
		]);
		p.state.failure = (r) =>
			r.url.searchParams.get('created_at')?.startsWith('lt.')
				? { code: '42501', message: 'Older notes denied', status: 403 }
				: null;
		await expect(
			port.listLeaderNotePage('person-a', {
				archived: false,
				limit: 2,
				before: { createdAt: note.created_at, id: 'c' }
			})
		).rejects.toThrow('Older notes denied');
	});
});
