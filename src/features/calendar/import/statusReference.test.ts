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
	sortOrder: 0
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
