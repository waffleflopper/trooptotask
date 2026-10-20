import { describe, expect, it } from 'vitest';
import type { Personnel } from './personnel.types';
import type { PersonnelExtendedInfo } from './personnelExtendedInfo.types';
import {
	changedDataSheetFields,
	dataSheetReadModel,
	dataSheetSavePayload,
	dataSheetValues,
	educationSummary,
	isDataSheetField,
	lastUpdatedLine,
	lossWindowHint,
	vehicleSummary
} from './dataSheetModel';

const person: Personnel = {
	id: 'p1',
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
	maritalStatus: 'Married',
	maritalStatusDate: '2026-09-06',
	numberOfDependents: 1,
	children: [],
	civilianEducation: "Associate's, Fayetteville Tech",
	militaryEducation: ['68W AIT', 'Air Assault'],
	emergencyContactName: 'Grace Okafor',
	emergencyContactRelationship: 'Spouse',
	emergencyContactPhone: '(910) 555-0177',
	spouseName: 'Grace Okafor',
	spousePhone: '(910) 555-0177',
	vehicleMakeModel: 'Toyota Tacoma',
	vehiclePlate: 'NC PKR-4471',
	vehicleColor: 'Gray',
	personalEmail: 'daniel.okafor@example.test',
	personalPhone: '(910) 555-0148',
	addressStreet: '412 Longleaf Dr, Apt 3B',
	addressCity: 'Fayetteville',
	addressState: 'NC',
	addressZip: '28314',
	address: '412 Longleaf Dr, Apt 3B, Fayetteville, NC, 28314',
	updatedAt: '2026-09-14T15:00:00.000Z',
	updatedBy: 'SSG Alvarez'
};

describe('Data sheet changes', () => {
	it('lists nothing for an untouched draft, however the saved values were spaced', () => {
		const saved = dataSheetValues(person, info);
		const draft = { ...saved, mos: ' 68W ', militaryEducation: '68W AIT\n\n  Air Assault  ' };
		expect(changedDataSheetFields(saved, draft)).toEqual([]);
	});

	it('lists each changed field once', () => {
		const saved = dataSheetValues(person, info);
		const draft = {
			...saved,
			ets: '2027-09-14',
			personalPhone: '(910) 555-0192',
			children: [{ name: 'Avery', age: '7' }]
		};
		expect(changedDataSheetFields(saved, draft)).toEqual(['ets', 'children', 'personalPhone']);
	});

	it('ignores a blank child row the user added and left empty', () => {
		const saved = dataSheetValues(person, info);
		const draft = { ...saved, children: [{ name: '', age: '' }] };
		expect(changedDataSheetFields(saved, draft)).toEqual([]);
	});

	it('compares the numbers a number input binds with the saved text', () => {
		const saved = dataSheetValues(person, { ...info, numberOfDependents: 1, children: [{ name: 'Avery', age: 7 }] });
		expect(
			changedDataSheetFields(saved, { ...saved, numberOfDependents: 1, children: [{ name: 'Avery', age: 7 }] })
		).toEqual([]);
		expect(
			changedDataSheetFields(saved, { ...saved, numberOfDependents: 2, children: [{ name: 'Avery', age: 8 }] })
		).toEqual(['numberOfDependents', 'children']);
		expect(changedDataSheetFields(saved, { ...saved, numberOfDependents: null })).toEqual(['numberOfDependents']);
	});

	it('treats a person with no sheet as a blank sheet', () => {
		const saved = dataSheetValues(person, null);
		expect(saved.bloodType).toBe('');
		expect(saved.numberOfDependents).toBe('');
		expect(changedDataSheetFields(saved, { ...saved, bloodType: 'A-' })).toEqual(['bloodType']);
	});

	it('knows which names are form fields', () => {
		expect(isDataSheetField('personalEmail')).toBe(true);
		expect(isDataSheetField('personnelId')).toBe(false);
	});
});

describe('Data sheet save payload', () => {
	it('sends every field, with empty Group and dates as null and counts as numbers', () => {
		const draft = {
			...dataSheetValues(person, info),
			groupId: '',
			ets: '',
			numberOfDependents: ' 2 ',
			children: [
				{ name: ' Avery ', age: '7' },
				{ name: 'Blake', age: '' },
				{ name: '', age: '' }
			],
			militaryEducation: ' 68W AIT \n\nAir Assault'
		};
		const payload = dataSheetSavePayload(draft);
		expect(payload.basicInfo).toEqual({
			rank: 'SGT',
			firstName: 'Daniel',
			lastName: 'Okafor',
			mos: '68W',
			clinicRole: 'Treatment NCO',
			groupId: null,
			ets: null,
			deros: null
		});
		expect(payload.extendedInfo).toMatchObject({
			numberOfDependents: 2,
			children: [
				{ name: 'Avery', age: 7 },
				{ name: 'Blake', age: null }
			],
			militaryEducation: ['68W AIT', 'Air Assault'],
			spouseName: 'Grace Okafor',
			spousePhone: '(910) 555-0177',
			vehicleColor: 'Gray'
		});
	});

	it('sends a cleared dependents count as null', () => {
		const payload = dataSheetSavePayload({ ...dataSheetValues(person, info), numberOfDependents: '' });
		expect(payload.extendedInfo.numberOfDependents).toBeNull();
	});
});

describe('Loss window hint', () => {
	const today = '2026-10-18';

	it('says nothing until the date changes', () => {
		expect(lossWindowHint('2027-03-14', '2027-03-14', today, 180)).toBeNull();
	});

	it('names the consequence of leaving the window', () => {
		expect(lossWindowHint('2027-03-14', '2027-09-14', today, 180)).toBe(
			'Was 14 Mar 2027. Leaves the loss window on save.'
		);
	});

	it('names the consequence of entering the window', () => {
		expect(lossWindowHint('2027-09-14', '2027-03-14', today, 180)).toBe(
			'Was 14 Sep 2027. Enters the loss window on save.'
		);
		expect(lossWindowHint('', '2027-03-14', today, 180)).toBe('Was not set. Enters the loss window on save.');
	});

	it('reports only the old date when the window state is unchanged or unknown', () => {
		expect(lossWindowHint('2028-03-14', '2028-04-14', today, 180)).toBe('Was 14 Mar 2028.');
		expect(lossWindowHint('2027-03-14', '2027-09-14', today, null)).toBe('Was 14 Mar 2027.');
	});
});

describe('Data sheet read model', () => {
	it('formats the saved record the way the read view shows it', () => {
		expect(dataSheetReadModel(person, info)).toEqual({
			basd: '2 Jun 2020',
			dateOfRank: '1 Feb 2024',
			ets: '14 Mar 2027',
			deros: '',
			bloodType: 'O+',
			civilianEducation: "Associate's, Fayetteville Tech",
			militaryEducation: '68W AIT · Air Assault',
			personalPhone: '(910) 555-0148',
			personalEmail: 'daniel.okafor@example.test',
			addressLines: ['412 Longleaf Dr, Apt 3B', 'Fayetteville, NC 28314'],
			emergencyContact: 'Grace Okafor · spouse',
			emergencyPhone: '(910) 555-0177',
			maritalStatus: 'Married · 6 Sep 2026',
			spouse: 'Grace Okafor · (910) 555-0177',
			dependents: '1 · no children',
			vehicle: 'Gray Toyota Tacoma',
			vehiclePlate: 'NC PKR-4471'
		});
	});

	it('leaves every value empty when the person has no sheet', () => {
		expect(dataSheetReadModel({ ...person, ets: null }, null)).toMatchObject({
			basd: '',
			ets: '',
			addressLines: [],
			dependents: '',
			emergencyContact: ''
		});
	});

	it('lists children with ages under dependents', () => {
		const withChildren = {
			...info,
			numberOfDependents: 2,
			children: [
				{ name: 'Avery', age: 7 },
				{ name: 'Blake', age: null }
			]
		};
		expect(dataSheetReadModel(person, withChildren).dependents).toBe('2 · Avery (7), Blake');
	});

	it('counts and lists saved children when no dependents count is set', () => {
		const withChildren = {
			...info,
			numberOfDependents: null,
			children: [
				{ name: 'Avery', age: 7 },
				{ name: 'Blake', age: null }
			]
		};
		expect(dataSheetReadModel(person, withChildren).dependents).toBe('2 · Avery (7), Blake');
	});

	it('keeps the stated count when it differs from the children listed', () => {
		const withChildren = { ...info, numberOfDependents: 3, children: [{ name: 'Avery', age: 7 }] };
		expect(dataSheetReadModel(person, withChildren).dependents).toBe('3 · Avery (7)');
	});
});

describe('Collapsed section summaries', () => {
	it('digests Education and Vehicle', () => {
		const values = dataSheetValues(person, info);
		expect(educationSummary(values)).toBe("Associate's, Fayetteville Tech · 2 military courses");
		expect(vehicleSummary(values)).toBe('Gray Toyota Tacoma · NC PKR-4471');
	});

	it('says Not set when a section is empty', () => {
		const blank = dataSheetValues(person, null);
		expect(educationSummary(blank)).toBe('Not set');
		expect(vehicleSummary(blank)).toBe('Not set');
	});
});

describe('Last updated footer', () => {
	const hint = 'Use Edit in the header to change these fields.';

	it('names the day and the member who saved', () => {
		expect(lastUpdatedLine({ updatedAt: '2026-09-14T12:00:00Z', updatedBy: 'SSG Alvarez' })).toBe(
			`Last updated 14 Sep 2026 by SSG Alvarez. ${hint}`
		);
	});

	it('drops the member when unknown and everything before a first save', () => {
		expect(lastUpdatedLine({ updatedAt: '2026-09-14T12:00:00Z', updatedBy: null })).toBe(
			`Last updated 14 Sep 2026. ${hint}`
		);
		expect(lastUpdatedLine({ updatedAt: null, updatedBy: null })).toBe(hint);
	});
});
