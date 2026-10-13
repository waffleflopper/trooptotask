import type { PersonnelOnboarding } from './onboarding.types';

const SYNC_CONCURRENCY = 4;

export interface TemplateSyncInput {
	/** The in-progress packets on the template that this client holds. */
	packets: PersonnelOnboarding[];
	/** In-progress packets the server counted on the template. It can exceed what the client holds. */
	counted: number;
	/** The same per-packet manage and configure checks the packet panel applies. */
	mayManage: (packet: PersonnelOnboarding) => boolean;
	resync: (onboardingId: string) => Promise<{ success: boolean }>;
}

export interface TemplateSyncResult {
	total: number;
	synced: number;
	outsideAccess: number;
	failed: number;
}

/** Re-syncs each in-progress packet on a template that the member may manage, a few at a time. */
export async function syncTemplatePackets({
	packets,
	counted,
	mayManage,
	resync
}: TemplateSyncInput): Promise<TemplateSyncResult> {
	const allowed = packets.filter(mayManage);
	let synced = 0;
	let next = 0;
	const worker = async () => {
		while (next < allowed.length) {
			const packet = allowed[next++];
			if ((await resync(packet.id)).success) synced++;
		}
	};
	await Promise.all(Array.from({ length: Math.min(SYNC_CONCURRENCY, allowed.length) }, worker));

	const total = Math.max(counted, packets.length);
	return {
		total,
		synced,
		outsideAccess: packets.length - allowed.length,
		failed: total - synced - (packets.length - allowed.length)
	};
}

export function describeTemplateSync({ total, synced, outsideAccess, failed }: TemplateSyncResult): string {
	if (total === 0) return 'No active packets to sync.';
	if (synced === total) return `Synced ${total} ${total === 1 ? 'packet' : 'packets'}`;
	const parts = [`Synced ${synced} of ${total}.`];
	if (outsideAccess > 0) parts.push(`${outsideAccess} ${outsideAccess === 1 ? 'is' : 'are'} outside your access.`);
	if (failed > 0) parts.push(`${failed} could not be synced. Try again.`);
	return parts.join(' ');
}
