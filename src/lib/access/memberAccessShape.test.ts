import { describe, expect, it } from 'vitest';
import {
	resolveStoredMemberAccessShape,
	serializeScopeSetForStorage,
	targetMemberAccessToStorage,
	TARGET_MEMBER_PRESET_CAPABILITIES,
	type MemberAccessShape
} from './memberAccessShape';

describe('member access shape', () => {
	it('exposes target Operator as operate capabilities', () => {
		expect(TARGET_MEMBER_PRESET_CAPABILITIES.operator).toEqual({
			calendar: 'operate',
			personnel: 'operate',
			training: 'operate',
			criticalTasks: 'operate',
			onboarding: 'operate',
			ratingScheme: 'operate'
		});
	});

	it('resolves a stored platform preset with explicit lane overrides while preserving preset lineage', () => {
		const shape = resolveStoredMemberAccessShape({
			membershipRole: 'member',
			memberPreset: 'viewer',
			capabilityOverrides: {
				calendar: 'operate',
				ratingScheme: 'none'
			},
			scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo', 'group-alpha'] }
		});

		expect(shape.memberPreset).toBe('viewer');
		expect(shape.capabilityMap).toEqual({
			...TARGET_MEMBER_PRESET_CAPABILITIES.viewer,
			calendar: 'operate',
			ratingScheme: 'none'
		});
		expect(shape.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] });
		expect(shape.canManageMembers).toBe(false);
	});

	it('normalizes admin storage to governance authority with organization-wide configure access', () => {
		const shape = resolveStoredMemberAccessShape({
			membershipRole: 'admin',
			memberPreset: 'viewer',
			capabilityOverrides: { calendar: 'none' },
			scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
		});

		expect(shape.memberPreset).toBe('viewer');
		expect(shape.capabilityMap.calendar).toBe('none');
		expect(shape.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-alpha'] });
		expect(shape.canManageMembers).toBe(true);
	});

	it('serializes Scope Set for replacement storage', () => {
		expect(
			serializeScopeSetForStorage({ kind: 'groups', groupIds: ['group-alpha', 'group-alpha', 'group-bravo'] })
		).toEqual({
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-alpha', 'group-bravo']
		});
	});

	it('projects target member access into replacement storage', () => {
		expect(
			targetMemberAccessToStorage({
				membershipRole: 'member',
				memberPreset: 'operator',
				capabilityOverrides: { calendar: 'configure', ratingScheme: 'none' },
				scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] }
			})
		).toEqual({
			memberPreset: 'operator',
			capabilityOverrides: { calendar: 'configure', ratingScheme: 'none' },
			scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] }
		});
	});

	it('represents target operate as capability levels instead of boolean edit flags', () => {
		const shape: MemberAccessShape = {
			membershipRole: 'member',
			memberPreset: 'operator',
			capabilityMap: {
				calendar: 'operate',
				personnel: 'operate',
				training: 'operate',
				criticalTasks: 'operate',
				onboarding: 'operate',
				ratingScheme: 'operate'
			},
			scopeSet: { kind: 'organization' },
			canManageMembers: false
		};

		expect(shape.capabilityMap).toMatchObject({
			calendar: 'operate',
			personnel: 'operate',
			ratingScheme: 'operate'
		});
		expect(shape.canManageMembers).toBe(false);
	});
});
