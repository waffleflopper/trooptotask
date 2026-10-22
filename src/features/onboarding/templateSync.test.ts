import { describe, expect, it, vi } from 'vitest';
import { syncTemplatePackets } from './templateSync';
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
	it('syncs every packet once and counts each as synced', async () => {
		const resync = vi.fn(async (_id: string) => ({ success: true }));

		const result = await syncTemplatePackets({ packets, counted: 7, mayManage: () => true, resync });

		expect(resync.mock.calls.map(([id]) => id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
		expect(result).toEqual({ total: 7, synced: 7, outsideAccess: 0, failed: 0 });
	});

	it('skips packets the member may not manage and says how many', async () => {
		const resync = vi.fn(async () => ({ success: true }));
		const mayManage = (p: PersonnelOnboarding) => !['f', 'g'].includes(p.id);

		const result = await syncTemplatePackets({ packets, counted: 7, mayManage, resync });

		expect(resync).not.toHaveBeenCalledWith('f');
		expect(resync).not.toHaveBeenCalledWith('g');
		expect(result).toEqual({ total: 7, synced: 5, outsideAccess: 2, failed: 0 });
	});

	it('reports packets that failed to sync, and packets the server counted but this client does not hold', async () => {
		const resync = vi.fn(async (id: string) => ({ success: id !== 'a' }));

		const result = await syncTemplatePackets({
			packets: packets.slice(0, 3),
			counted: 4,
			mayManage: () => true,
			resync
		});

		expect(result).toEqual({ total: 4, synced: 2, outsideAccess: 0, failed: 2 });
	});

	it('reports access and failures together', async () => {
		const resync = vi.fn(async (id: string) => ({ success: id !== 'a' }));
		const result = await syncTemplatePackets({
			packets: packets.slice(0, 4),
			counted: 4,
			mayManage: (p) => p.id !== 'd',
			resync
		});

		expect(result).toEqual({ total: 4, synced: 2, outsideAccess: 1, failed: 1 });
	});

	it('syncs packets concurrently in bounded waves and counts all admitted results', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started: string[] = [];
		const resync = async (id: string) => {
			started.push(id);
			await gate;
			return { success: true };
		};

		const pending = syncTemplatePackets({ packets, counted: 7, mayManage: () => true, resync });
		try {
			expect(started.length).toBeGreaterThan(1);
			expect(started.length).toBeLessThan(packets.length);
		} finally {
			release();
		}

		expect(await pending).toEqual({ total: 7, synced: 7, outsideAccess: 0, failed: 0 });
		expect(started.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
	});
});
