import { describe, expect, it, vi } from 'vitest';
import { describeTemplateSync, syncTemplatePackets } from './templateSync';
import type { PersonnelOnboarding } from './onboarding.types';

function packet(id: string): PersonnelOnboarding {
	return {
		id,
		personnelId: `person-${id}`,
		startedAt: '2026-10-01',
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		steps: [],
		templateId: 'template-1'
	};
}

const packets = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(packet);

describe('syncing the active packets on a template', () => {
	it('syncs every packet and reports one message', async () => {
		const resync = vi.fn(async () => ({ success: true }));

		const result = await syncTemplatePackets({ packets, counted: 7, mayManage: () => true, resync });

		expect(resync).toHaveBeenCalledTimes(7);
		expect(describeTemplateSync(result)).toBe('Synced 7 packets');
	});

	it('skips packets the member may not manage and says how many', async () => {
		const resync = vi.fn(async () => ({ success: true }));
		const mayManage = (p: PersonnelOnboarding) => !['f', 'g'].includes(p.id);

		const result = await syncTemplatePackets({ packets, counted: 7, mayManage, resync });

		expect(resync).not.toHaveBeenCalledWith('f');
		expect(resync).not.toHaveBeenCalledWith('g');
		expect(describeTemplateSync(result)).toBe('Synced 5 of 7. 2 are outside your access.');
	});

	it('reports packets that failed to sync, and packets the server counted but this client does not hold', async () => {
		const resync = vi.fn(async (id: string) => ({ success: id !== 'a' }));

		const result = await syncTemplatePackets({ packets: packets.slice(0, 3), counted: 4, mayManage: () => true, resync });

		expect(describeTemplateSync(result)).toBe('Synced 2 of 4. 2 could not be synced. Try again.');
	});

	it('reports access and failures together', async () => {
		const resync = vi.fn(async (id: string) => ({ success: id !== 'a' }));
		const result = await syncTemplatePackets({
			packets: packets.slice(0, 4),
			counted: 4,
			mayManage: (p) => p.id !== 'd',
			resync
		});

		expect(describeTemplateSync(result)).toBe('Synced 2 of 4. 1 is outside your access. 1 could not be synced. Try again.');
	});

	it('uses singular wording for one packet and says when there is nothing to sync', async () => {
		const one = await syncTemplatePackets({
			packets: [packet('a')],
			counted: 1,
			mayManage: () => true,
			resync: async () => ({ success: true })
		});
		expect(describeTemplateSync(one)).toBe('Synced 1 packet');

		const none = await syncTemplatePackets({ packets: [], counted: 0, mayManage: () => true, resync: vi.fn() });
		expect(describeTemplateSync(none)).toBe('No active packets to sync.');
	});

	it('never has more than four syncs in flight', async () => {
		let inFlight = 0;
		let peak = 0;
		const resync = async () => {
			peak = Math.max(peak, ++inFlight);
			await new Promise((resolve) => setTimeout(resolve, 1));
			inFlight--;
			return { success: true };
		};

		await syncTemplatePackets({ packets, counted: 7, mayManage: () => true, resync });

		expect(peak).toBe(4);
	});
});
