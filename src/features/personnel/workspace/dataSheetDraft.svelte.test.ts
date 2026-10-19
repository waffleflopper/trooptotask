import { describe, expect, it, vi } from 'vitest';
import type { Personnel } from '../personnel.types';
import type { PersonnelExtendedInfo } from '../personnelExtendedInfo.types';
import { DataSheetDraft } from './dataSheetDraft.svelte';

const person: Personnel = {
	id: 'p1',
	slug: 'okafor-daniel',
	rank: 'SGT',
	firstName: 'Daniel',
	lastName: 'Okafor',
	mos: '68W',
	clinicRole: 'Treatment NCO',
	groupId: 'g1',
	groupName: '2nd Platoon',
	ets: '2027-03-14',
	deros: null
};

const info: PersonnelExtendedInfo = {
	bloodType: 'O+',
	basd: '2020-06-02',
	dateOfRank: '2024-02-01',
	maritalStatus: 'Single',
	maritalStatusDate: '',
	numberOfDependents: 0,
	children: [],
	civilianEducation: '',
	militaryEducation: [],
	emergencyContactName: '',
	emergencyContactRelationship: '',
	emergencyContactPhone: '',
	spouseName: '',
	spousePhone: '',
	vehicleMakeModel: '',
	vehiclePlate: '',
	vehicleColor: '',
	personalEmail: '',
	personalPhone: '',
	addressStreet: '',
	addressCity: '',
	addressState: '',
	addressZip: '',
	address: '',
	updatedAt: null,
	updatedBy: null
};

function draftWith(response: Response) {
	const fetchMock = vi.fn().mockResolvedValue(response);
	const draft = new DataSheetDraft({ orgId: 'org-1', person, info }, { fetch: fetchMock as typeof fetch });
	return { draft, fetchMock };
}

describe('DataSheetDraft', () => {
	it('counts changed fields and saves nothing when nothing changed', async () => {
		const { draft, fetchMock } = draftWith(Response.json({}));
		expect(draft.changeCount).toBe(0);
		expect(await draft.save()).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();

		draft.values.mos = '68X';
		draft.values.personalPhone = '(910) 555-0148';
		expect(draft.changeCount).toBe(2);
		expect(draft.isChanged('mos')).toBe(true);
		expect(draft.isChanged('rank')).toBe(false);
	});

	it('saves both halves in one request and resets its baseline to the saved record', async () => {
		const saved = { ...person, mos: '68X' };
		const { draft, fetchMock } = draftWith(
			Response.json({ saved: true, person: saved, extendedInfo: { ...info, personalPhone: '(910) 555-0148' } })
		);
		draft.values.mos = '68X';
		draft.values.personalPhone = '(910) 555-0148';

		const result = await draft.save();

		expect(result?.person.mos).toBe('68X');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/org/org-1/api/personnel/p1/data-sheet');
		expect(init.method).toBe('PUT');
		expect(JSON.parse(init.body)).toMatchObject({
			basicInfo: { mos: '68X', lastName: 'Okafor' },
			extendedInfo: { personalPhone: '(910) 555-0148', bloodType: 'O+' }
		});
		expect(draft.changeCount).toBe(0);
	});

	it('shows a refused field inline until that field changes, and keeps every edit', async () => {
		const { draft } = draftWith(
			Response.json({ saved: false, field: 'personalEmail', message: 'Enter a valid email address.' }, { status: 400 })
		);
		draft.values.personalEmail = 'not-an-email';
		draft.values.mos = '68X';

		expect(await draft.save()).toBeNull();

		expect(draft.errorFor('personalEmail')).toBe('Enter a valid email address.');
		expect(draft.errorFor('mos')).toBeUndefined();
		expect(draft.changeCount).toBe(2);
		expect(draft.formError).toBe('');

		draft.values.personalEmail = 'not-an-email-either';
		expect(draft.errorFor('personalEmail')).toBeUndefined();
	});

	it('shows the form message when the refused field is not a form field', async () => {
		const { draft } = draftWith(
			Response.json(
				{ saved: false, field: 'personnelId', message: 'This person is no longer available.' },
				{ status: 400 }
			)
		);
		draft.values.mos = '68X';

		expect(await draft.save()).toBeNull();

		expect(draft.formError).toBe('This person is no longer available.');
		expect(draft.rejection).toBeNull();
	});

	it('shows a fallback message when the request fails outright', async () => {
		const { draft } = draftWith(new Response('boom', { status: 500 }));
		draft.values.mos = '68X';

		expect(await draft.save()).toBeNull();

		expect(draft.formError).not.toBe('');
		expect(draft.saving).toBe(false);
	});
});
