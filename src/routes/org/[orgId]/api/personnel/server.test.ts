import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _patchConfig, _postConfig, _putConfig } from './+server';

function legacyAuthShouldNotAuthorize() {
	return {
		requireEdit: vi.fn(() => {
			throw new Error('legacy requireEdit should not authorize Personnel workflows');
		}),
		requirePrivileged: vi.fn(() => {
			throw new Error('legacy requirePrivileged should not authorize Personnel workflows');
		})
	};
}

describe('/api/personnel route authorization', () => {
	it('declares policy-first route authorization for personnel roster lifecycle writes', () => {
		expect(_postConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.createRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect(_putConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect(_deleteConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.archiveRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect(_patchConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.restoreRecords,
			policyResource: { kind: 'unscoped' }
		});
		for (const config of [_postConfig, _putConfig, _deleteConfig, _patchConfig]) {
			expect('permission' in config).toBe(false);
			expect('deferPolicyToUseCase' in config).toBe(false);
		}
	});

	it('creates personnel through configure-level use-case Policy Decisions without route-level legacy edit gates', async () => {
		const legacyAuth = legacyAuthShouldNotAuthorize();
		const ctx = createTestContext({
			auth: {
				...legacyAuth,
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		const result = (await handleUseCaseRequest(_postConfig, ctx, {
			rank: 'SGT',
			lastName: 'Smith',
			firstName: 'Jamie',
			mos: '11B',
			clinicRole: 'Team Leader',
			groupId: null
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ rank: 'SGT', lastName: 'Smith' });
		expect(legacyAuth.requireEdit).not.toHaveBeenCalled();
	});

	it('updates personnel through use-case Policy Decisions without route-level legacy edit gates', async () => {
		const legacyAuth = legacyAuthShouldNotAuthorize();
		const ctx = createTestContext({
			auth: {
				...legacyAuth,
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.store.seed('personnel', [
			{
				id: '11111111-1111-4111-8111-111111111111',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null
			}
		]);

		const result = (await handleUseCaseRequest(_putConfig, ctx, {
			id: '11111111-1111-4111-8111-111111111111',
			rank: 'SSG'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ id: '11111111-1111-4111-8111-111111111111', rank: 'SSG' });
		expect(legacyAuth.requireEdit).not.toHaveBeenCalled();
	});

	it('archives personnel through use-case Policy Decisions without route-level legacy edit gates', async () => {
		const legacyAuth = legacyAuthShouldNotAuthorize();
		const ctx = createTestContext({
			auth: {
				...legacyAuth,
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.store.seed('personnel', [
			{
				id: '11111111-1111-4111-8111-111111111111',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_deleteConfig, ctx, { id: '11111111-1111-4111-8111-111111111111' });

		expect(result).toEqual({ success: true });
		expect(legacyAuth.requireEdit).not.toHaveBeenCalled();
	});

	it('restores personnel through Personnel policy decisions without route-level privileged gates', async () => {
		const legacyAuth = legacyAuthShouldNotAuthorize();
		const ctx = createTestContext({
			auth: {
				...legacyAuth,
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.store.seed('personnel', [
			{
				id: '11111111-1111-4111-8111-111111111111',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_patchConfig, ctx, {
			action: 'restore',
			id: '11111111-1111-4111-8111-111111111111'
		});

		expect(result).toEqual({ success: true });
		expect(legacyAuth.requirePrivileged).not.toHaveBeenCalled();
	});
});
