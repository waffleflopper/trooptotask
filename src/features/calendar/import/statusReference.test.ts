import { expect, it } from 'vitest';
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

	expect(await reference.create!.run(' leave ')).toEqual({
		kind: 'created',
		option: { id: 'leave', label: 'Leave', value: status('leave', 'Leave') },
		saved: []
	});
	expect(await reference.create!.run('TDY')).toMatchObject({ kind: 'created', saved: [{ id: 'tdy', label: 'TDY' }] });
	expect(written).toEqual(['TDY']);
});
