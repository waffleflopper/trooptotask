import type { ScopeSet } from './memberAccessShape';

export type ScopeSetResource =
	| { kind: 'organization' }
	| { kind: 'group'; groupId: string }
	| { kind: 'user'; userId: string }
	| { kind: 'unscoped' };

export type MatchedScope =
	| { kind: 'organization' }
	| { kind: 'group'; groupId: string }
	| { kind: 'unscoped' }
	| { kind: 'out-of-scope'; resource: ScopeSetResource };

export function scopeSetResourceForGroupId(groupId: unknown): ScopeSetResource {
	return typeof groupId === 'string' && groupId.length > 0 ? { kind: 'group', groupId } : { kind: 'organization' };
}

export function matchScopeSet(scopeSet: ScopeSet, resource: ScopeSetResource): MatchedScope {
	if (resource.kind === 'unscoped') {
		return { kind: 'unscoped' };
	}

	if (scopeSet.kind === 'organization') {
		if (resource.kind === 'group') {
			return { kind: 'group', groupId: resource.groupId };
		}

		return { kind: 'organization' };
	}

	if (resource.kind === 'group' && scopeSet.groupIds.includes(resource.groupId)) {
		return { kind: 'group', groupId: resource.groupId };
	}

	return { kind: 'out-of-scope', resource };
}

export function isScopeSetMatchAllowed(match: MatchedScope): boolean {
	return match.kind !== 'out-of-scope';
}
