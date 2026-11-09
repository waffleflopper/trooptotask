import { expect, it } from 'vitest';
import type { SavedRecord } from '$lib/components/patterns/import-flow';
import type { StatusType } from '../contracts';
import { statusReference } from './statusReference';

const status = (id: string, name: string): StatusType => ({
	id,
	name,
	color: '#4a5568',
	textColor: '#ffffff',
	shortLabel: null,
	rosterEffect: 'available',
	sortOrder: 0,
	archivedAt: null
});

it('reports a status type as saved only when the create wrote one', async () => {
	const written: string[] = [];
	const reference = statusReference([status('leave', 'Leave')], async (name) => {
		written.push(name);
		return status('tdy', name);
	});

	const saved: SavedRecord[] = [];
	const record = (item: SavedRecord) => saved.push(item);

	expect(await reference.create!.run(' leave ', record)).toEqual({
		kind: 'created',
		option: { id: 'leave', label: 'Leave', value: status('leave', 'Leave') }
	});
	expect(saved).toEqual([]);
	expect(await reference.create!.run('TDY', record)).toMatchObject({ kind: 'created', option: { id: 'tdy' } });
	expect(saved).toEqual([{ id: 'tdy', label: 'TDY' }]);
	expect(written).toEqual(['TDY']);
});

const archived = (id: string, name: string): StatusType => ({
	...status(id, name),
	archivedAt: '2030-01-02T03:04:05Z'
});

it('offers only active statuses and explains why an archived exact match is refused', () => {
	const reference = statusReference([status('leave', 'Leave'), archived('sick', 'Sick')]);

	expect(reference.options.map((option) => option.id)).toEqual(['leave']);
	expect(reference.find('sick')).toEqual({
		kind: 'none',
		reason: "'Sick' is archived. Restore it to import its records."
	});
	expect(reference.find('leave')).toMatchObject({ kind: 'one', option: { id: 'leave' } });
});

it('never suggests an archived status for an abbreviation', () => {
	const sick = { ...archived('sick', 'Sick Call'), shortLabel: 'SC' };
	const reference = statusReference([sick, status('school', 'School Call')]);

	expect(reference.find('sc')).toEqual({ kind: 'none', suggestion: expect.objectContaining({ id: 'school' }) });
});

it('refuses to create a status whose name an archived one already holds', async () => {
	let created = 0;
	const reference = statusReference([archived('sick', 'Sick')], async (name) => {
		created++;
		return status('new', name);
	});

	expect(await reference.create!.run('sick', () => undefined)).toEqual({
		kind: 'refused',
		message: "'Sick' is archived. Restore it to import its records."
	});
	expect(created).toBe(0);
});
