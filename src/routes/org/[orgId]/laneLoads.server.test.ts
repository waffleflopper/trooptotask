import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { load as dashboardLayout } from './(dashboard)/+layout.server';
import { load as dashboardPage } from './(dashboard)/+page.server';
import { load as calendar } from './calendar/+layout.server';
import { load as criticalTasks } from './critical-tasks/+layout.server';
import { load as criticalTasksWorkspace } from './critical-tasks/(workspace)/+layout.server';
import { load as evals } from './evals/+layout.server';
import { load as onboarding } from './onboarding/+layout.server';
import { load as settingsLayout } from './settings/+layout.server';
import { load as settingsPage } from './settings/+page.server';
import { load as generalSettings } from './settings/general/+page.server';
import { load as logs } from './settings/logs/+page.server';
import { load as training } from './training/+layout.server';
import { load as trainingWorkspace } from './training/(workspace)/+layout.server';

const ORG = '11111111-1111-4111-8111-111111111111';
const lanes = [
	{ name: 'Dashboard layout', load: dashboardLayout },
	{ name: 'Dashboard page', load: dashboardPage },
	{ name: 'Calendar', load: calendar },
	{ name: 'Critical Tasks', load: criticalTasks },
	{ name: 'Critical Tasks workspace', load: criticalTasksWorkspace },
	{ name: 'Evals', load: evals },
	{ name: 'Onboarding', load: onboarding },
	{ name: 'Settings layout', load: settingsLayout },
	{ name: 'Settings index', load: settingsPage },
	{ name: 'Settings section', load: generalSettings },
	{ name: 'Settings logs', load: logs },
	{ name: 'Training', load: training },
	{ name: 'Training workspace', load: trainingWorkspace }
];

function eventFor<TEvent>(
	state: 'unknown' | 'suspended' | 'nonmember' | 'member' = 'member',
	disabledFeatures: string[] = []
) {
	const supabase = createClient('http://lane-load.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input) => {
				const url = new URL(String(input));
				if (url.pathname.endsWith('/organizations'))
					return Response.json(
						state === 'unknown'
							? null
							: {
									id: ORG,
									name: 'Alpha',
									url_slug: 'alpha',
									suspended_at: state === 'suspended' ? '2026-01-01T00:00:00Z' : null,
									disabled_features: disabledFeatures
								}
					);
				if (url.pathname.endsWith('/rpc/read_request_member_access'))
					return Response.json(
						state === 'nonmember'
							? null
							: {
									id: 'membership-1',
									role: 'member',
									member_preset: 'viewer',
									capability_overrides: {
										calendar: 'none',
										personnel: 'none',
										training: 'none',
										criticalTasks: 'none',
										onboarding: 'none',
										ratingScheme: 'none'
									},
									access_scope_kind: 'organization',
									access_scope_group_ids: []
								}
					);
				throw new Error(`Private data must not be loaded: ${url.pathname}`);
			}
		}
	});
	return {
		locals: { supabase, actor: { userId: 'user-1' }, session: null },
		params: { orgId: 'alpha' },
		cookies: { get: () => undefined, getAll: () => [] },
		depends: () => undefined,
		route: { id: '/org/[orgId]/settings/general' },
		untrack: <T>(read: () => T) => read(),
		parent: () => {
			throw new Error('Feature loads must not rerun ancestors');
		}
	} as unknown as TEvent;
}

describe.each(lanes)('$name request admission', ({ name, load }) => {
	it('rejects an unknown Organization without running ancestors or private reads', async () => {
		await expect(load(eventFor('unknown'))).rejects.toMatchObject({
			status: 404,
			body: { message: 'Organization not found' }
		});
	});
	it('rejects a non-member without running ancestors or private reads', async () => {
		await expect(load(eventFor('nonmember'))).rejects.toMatchObject({ status: 403 });
	});
	it('preserves the suspended Organization response', async () => {
		const result = load(eventFor('suspended'));
		if (name === 'Settings layout' || name === 'Settings index') {
			await expect(result).rejects.toMatchObject({ status: 303, location: '/org/alpha' });
		} else if (name === 'Settings section' || name === 'Settings logs') {
			await expect(result).resolves.toEqual({});
		} else {
			await expect(result).rejects.toMatchObject({ status: 403, body: { message: 'Organization is suspended' } });
		}
	});
});

it.each([
	{ load: training, feature: 'training' },
	{ load: trainingWorkspace, feature: 'training' },
	{ load: criticalTasks, feature: 'criticalTasks' },
	{ load: criticalTasksWorkspace, feature: 'criticalTasks' },
	{ load: evals, feature: 'evaluations' },
	{ load: onboarding, feature: 'onboarding' }
])('keeps a disabled $feature lane closed', async ({ load, feature }) => {
	await expect(load(eventFor('member', [feature]))).rejects.toMatchObject({
		status: 403,
		body: { featureOff: feature }
	});
});

it('streams Calendar denial without fetching private facts or running ancestors', async () => {
	const result = await calendar(eventFor());
	await expect(result && result.calendar.data).resolves.toEqual({ laneKey: 'calendar', access: 'restricted' });
});

it('streams Training denial without fetching private facts or running ancestors', async () => {
	const result = await trainingWorkspace(eventFor());
	await expect(result && result.training.data).resolves.toEqual({ laneKey: 'training', access: 'restricted' });
});

it('streams Critical Tasks denial without fetching private facts or running ancestors', async () => {
	const result = await criticalTasksWorkspace(eventFor());
	await expect(result && result.criticalTasks.data).resolves.toEqual({
		laneKey: 'critical-tasks',
		access: 'restricted'
	});
});

it('streams Evals denial without fetching private facts or running ancestors', async () => {
	const result = await evals(eventFor());
	await expect(result && result.ratingScheme.data).resolves.toEqual({ laneKey: 'ratingScheme', access: 'restricted' });
});
