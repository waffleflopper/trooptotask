import type { RequestEvent } from '@sveltejs/kit';
import { createSupabasePlatformAudit } from '$lib/audit/index.server';
import { admitPlatformAdministrator } from './admission.server';

export async function createPlatformAuditOperations(event: RequestEvent) {
	const { adminClient } = await admitPlatformAdministrator(event);
	const audit = createSupabasePlatformAudit(adminClient);
	return { listLogs: audit.listLogs };
}
