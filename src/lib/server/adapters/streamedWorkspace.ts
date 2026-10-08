export interface DeferredData<T> {
	data: Promise<T>;
}

export type HydrationItems<T = unknown> = T[] | Promise<T[]>;

export interface WorkspaceHydrationTarget<T, TMode extends string> {
	mode: TMode;
	deferred?: boolean;
	snapshotKey: string;
	items: HydrationItems<T>;
}

export interface WorkspaceValueHydrationTarget<TValue, TMode extends string> {
	mode: TMode;
	deferred?: boolean;
	snapshotKey: string;
	items: TValue | Promise<TValue>;
}

export type ResolvedSnapshotKeyStrategy = 'hash' | 'json' | 'random';

interface CreateWorkspaceHydrationTargetOptions<TMode extends string> {
	mode: TMode;
	resolvedSnapshotKey?: ResolvedSnapshotKeyStrategy;
}

interface CreateSnapshotKeyOptions {
	resolved?: ResolvedSnapshotKeyStrategy;
}

const deferredSnapshotKeys = new WeakMap<object, string>();
let fallbackSnapshotCounter = 0;

export function isPromiseLike<T>(value: unknown): value is Promise<T> {
	return (
		!!value &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { then?: unknown }).then === 'function'
	);
}

function generateSnapshotId(prefix: string): string {
	const randomId = globalThis.crypto?.randomUUID?.();
	if (randomId) {
		return `${prefix}:${randomId}`;
	}

	fallbackSnapshotCounter = (fallbackSnapshotCounter + 1) % 1_000_000;
	return `${prefix}:fallback:${fallbackSnapshotCounter}`;
}

function hashSnapshotContent(content: string): string {
	let hash = 2166136261;
	for (let index = 0; index < content.length; index += 1) {
		hash ^= content.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function createResolvedSnapshotKey(value: unknown, strategy: ResolvedSnapshotKeyStrategy): string {
	if (strategy === 'random') {
		return generateSnapshotId('resolved');
	}

	try {
		const content = JSON.stringify(value) ?? String(value);
		if (strategy === 'hash') {
			return `resolved:${content.length}:${hashSnapshotContent(content)}`;
		}
		return `resolved:${content}`;
	} catch {
		return generateSnapshotId(strategy === 'hash' ? 'resolved' : 'resolved:fallback');
	}
}

export function createWorkspaceSnapshotKey(value: unknown, options: CreateSnapshotKeyOptions = {}): string {
	if (isPromiseLike(value)) {
		let key = deferredSnapshotKeys.get(value);
		if (!key) {
			key = generateSnapshotId('deferred');
			deferredSnapshotKeys.set(value, key);
		}
		return key;
	}

	return createResolvedSnapshotKey(value, options.resolved ?? 'hash');
}

export function createCompositeWorkspaceSnapshotKey(
	parts: Record<string, unknown>,
	options: CreateSnapshotKeyOptions = {}
): string {
	return createWorkspaceSnapshotKey(
		Object.fromEntries(
			Object.keys(parts)
				.sort()
				.map((key) => [key, createWorkspaceSnapshotKey(parts[key], options)])
		),
		options
	);
}

export function createWorkspaceHydrationTarget<T, TMode extends string>(
	items: HydrationItems<T>,
	options: CreateWorkspaceHydrationTargetOptions<TMode>
): WorkspaceHydrationTarget<T, TMode> {
	return createWorkspaceValueHydrationTarget(items, options);
}

export function createWorkspaceValueHydrationTarget<TValue, TMode extends string>(
	items: TValue | Promise<TValue>,
	options: CreateWorkspaceHydrationTargetOptions<TMode>
): WorkspaceValueHydrationTarget<TValue, TMode> {
	return {
		mode: options.mode,
		deferred: isPromiseLike(items),
		snapshotKey: createWorkspaceSnapshotKey(items, { resolved: options.resolvedSnapshotKey }),
		items
	};
}
