import { describe, expect, it } from 'vitest';
import {
	projectEffectiveInvitationAccess,
	projectEffectiveMemberAccess,
	type MemberAccessProjectionRow
} from './memberAccessProjection';

const baseMemberRow: MemberAccessProjectionRow = {
	role: 'member',
	member_preset: 'viewer',
	capability_overrides: {},
	access_scope_kind: 'organization',
	access_scope_group_ids: []
};

describe('member access projection', () => {
	it('projects privileged effective access without using stored row limits', () => {
		const projection = projectEffectiveMemberAccess({
			...baseMemberRow,
			role: 'admin',
			member_preset: 'viewer',
			capability_overrides: { calendar: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-alpha']
		});

		expect(projection.isPrivileged).toBe(true);
		expect(projection.memberPreset).toBe('editor');
		expect(projection.scopeSet).toEqual({ kind: 'organization' });
		expect(Object.values(projection.capabilityMap)).toEqual([
			'configure',
			'configure',
			'configure',
			'configure',
			'configure',
			'configure'
		]);
		expect(projection.canManageMembers).toBe(true);
	});

	it('projects replacement storage for effective nonprivileged scope and capabilities', () => {
		const projection = projectEffectiveMemberAccess({
			...baseMemberRow,
			member_preset: 'viewer',
			capability_overrides: { calendar: 'operate', ratingScheme: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['stored-group', 'stored-group', 'other-group']
		});

		expect(projection.scopeSet).toEqual({ kind: 'groups', groupIds: ['stored-group', 'other-group'] });
		expect(projection.memberPreset).toBe('viewer');
		expect(projection.capabilityMap.calendar).toBe('operate');
		expect(projection.capabilityMap.ratingScheme).toBe('none');
	});

	it('fails fast when nonprivileged access is missing replacement storage', () => {
		expect(() =>
			projectEffectiveMemberAccess({
				role: 'member'
			})
		).toThrow('Member access projection requires normalized replacement storage');
	});

	it('projects replacement invitation access', () => {
		const projection = projectEffectiveInvitationAccess({
			role: 'member',
			member_preset: 'operator',
			capability_overrides: { ratingScheme: 'configure' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-alpha']
		});

		expect(projection.role).toBe('member');
		expect(projection.memberPreset).toBe('operator');
		expect(projection.capabilityMap.calendar).toBe('operate');
		expect(projection.capabilityMap.ratingScheme).toBe('configure');
		expect(projection.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-alpha'] });
	});

	it('uses invitation role for privileged access instead of inferring from legacy flags', () => {
		const projection = projectEffectiveInvitationAccess({
			role: 'admin',
			member_preset: 'viewer',
			capability_overrides: { calendar: 'none' },
			access_scope_kind: 'groups',
			access_scope_group_ids: ['legacy-group']
		});

		expect(projection.role).toBe('admin');
		expect(projection.memberPreset).toBe('editor');
		expect(projection.scopeSet).toEqual({ kind: 'organization' });
		expect(projection.canManageMembers).toBe(true);
	});

	it('defaults invitations without a replacement role to member access', () => {
		const projection = projectEffectiveInvitationAccess({
			member_preset: 'editor',
			access_scope_kind: 'organization'
		});

		expect(projection.role).toBe('member');
		expect(projection.capabilityMap.calendar).toBe('configure');
		expect(projection.canManageMembers).toBe(false);
	});

	it('does not project owner access from invitation role values', () => {
		const projection = projectEffectiveInvitationAccess({
			role: 'owner',
			member_preset: 'editor'
		});

		expect(projection.role).toBe('member');
		expect(projection.isOwner).toBe(false);
	});
});
