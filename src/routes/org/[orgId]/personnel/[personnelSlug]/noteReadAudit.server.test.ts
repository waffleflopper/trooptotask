import { describe, expect, it, vi } from 'vitest';
import type { loadRequestPersonnelReadiness } from '$lib/server/adapters/personnelReadinessLoad';
import {
	createRequestPersonnelArchivedArtifactsContext,
	createRequestPersonnelDetailContext,
	createRequestPersonnelLeaderNoteContext,
	createRequestPersonnelOverviewContext
} from '$lib/server/adapters/requestContexts.server';
import { _createPersonnelArchivedPageLoad } from './archived/+page.server';
import { _createPersonnelLogPageLoad } from './log/+page.server';
import { _createPersonnelOverviewPageLoad } from './+page.server';

const page = {
	params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
	locals: {} as App.Locals,
	cookies: { get: () => undefined },
	depends: vi.fn(),
	request: new Request('http://app.invalid/'),
	getClientAddress: () => '127.0.0.1'
};

// Page loads write no audit entry unless they hand their event over, and these three show the text of leader notes.
function sinkRecordingLoad() {
	const configs: { context: unknown; auditEvent?: unknown }[] = [];
	const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => {
		configs.push(config);
		return config.context === createRequestPersonnelDetailContext ? { person: { id: 'person-1' } } : {};
	});
	return { configs, loadWithContext };
}

const readiness = (async () => ({
	attention: Promise.resolve({ items: [] })
})) as unknown as typeof loadRequestPersonnelReadiness;

describe('pages that show leader notes', () => {
	it.each([
		[
			'Overview',
			createRequestPersonnelOverviewContext,
			(loadWithContext: never) => _createPersonnelOverviewPageLoad({ loadWithContext, loadReadiness: readiness })
		],
		[
			'Log',
			createRequestPersonnelLeaderNoteContext,
			(loadWithContext: never) => _createPersonnelLogPageLoad({ loadWithContext })
		],
		[
			'Archived',
			createRequestPersonnelArchivedArtifactsContext,
			(loadWithContext: never) => _createPersonnelArchivedPageLoad({ loadWithContext })
		]
	])('%s loads its notes with a request that writes the open', async (_name, context, createLoad) => {
		const { configs, loadWithContext } = sinkRecordingLoad();

		await createLoad(loadWithContext as never)(page as never);

		expect(configs.find((config) => config.context === context)?.auditEvent).toBe(page);
	});
});
