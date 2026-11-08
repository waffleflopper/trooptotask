import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

/** How long after an archive its Undo token is honoured. The toast offers far less; this only bounds a stale click. */
export const ARCHIVE_UNDO_WINDOW_MS = 2 * 60_000;

/** What an archive did, bound to who did it and when. Undo may only reverse exactly this. */
export interface ArchiveUndoClaims {
	orgId: string;
	actorId: string;
	/** The exact event time the archive wrote; a Person archived again later carries a different one. */
	archivedAt: string;
	/** People this call archived, not ones already archived. */
	personnelIds: string[];
	/** Archival requests this call created, not duplicates of earlier ones. */
	requestIds: string[];
	expiresAt: number;
}

export type ArchiveUndoVerdict =
	| { ok: true; claims: ArchiveUndoClaims }
	| { ok: false; reason: 'invalid' | 'expired' | 'other-actor' | 'other-organization' };

function secret(): string {
	const configured = env.ACCOUNT_SETUP_SESSION_SECRET ?? process.env.ACCOUNT_SETUP_SESSION_SECRET;
	if (configured) return configured;
	if (import.meta.env.DEV) return 'dev-account-setup-session-secret';
	throw new Error('ACCOUNT_SETUP_SESSION_SECRET is required to sign archive Undo tokens');
}

const signature = (payload: string): Buffer =>
	createHmac('sha256', secret()).update('personnel-archive-undo:v1:').update(payload).digest();

const isStrings = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((entry) => typeof entry === 'string');

export function signArchiveUndo(claims: ArchiveUndoClaims): string {
	const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
	return `${payload}.${signature(payload).toString('base64url')}`;
}

/** Accepts only a token this server signed, for this Organization and this person, before it expires. */
export function verifyArchiveUndo(
	token: unknown,
	expected: { orgId: string; actorId: string },
	now: number
): ArchiveUndoVerdict {
	if (typeof token !== 'string') return { ok: false, reason: 'invalid' };
	const [payload, given, ...extra] = token.split('.');
	if (!payload || !given || extra.length) return { ok: false, reason: 'invalid' };
	const provided = Buffer.from(given, 'base64url');
	const actual = signature(payload);
	if (provided.length !== actual.length || !timingSafeEqual(provided, actual)) return { ok: false, reason: 'invalid' };

	let claims: Partial<ArchiveUndoClaims>;
	try {
		claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	} catch {
		return { ok: false, reason: 'invalid' };
	}
	if (
		typeof claims.orgId !== 'string' ||
		typeof claims.actorId !== 'string' ||
		typeof claims.archivedAt !== 'string' ||
		Number.isNaN(Date.parse(claims.archivedAt)) ||
		typeof claims.expiresAt !== 'number' ||
		!isStrings(claims.personnelIds) ||
		!isStrings(claims.requestIds)
	)
		return { ok: false, reason: 'invalid' };
	if (claims.orgId !== expected.orgId) return { ok: false, reason: 'other-organization' };
	if (claims.actorId !== expected.actorId) return { ok: false, reason: 'other-actor' };
	if (now >= claims.expiresAt) return { ok: false, reason: 'expired' };
	return { ok: true, claims: claims as ArchiveUndoClaims };
}

/** The token for an archive, or undefined when it archived no one and created no request, so there is nothing to take back. */
export function issueArchiveUndo(
	who: { orgId: string; actorId: string },
	archive: { archivedAt: string | null; personnelIds: readonly string[]; requestIds: readonly string[] },
	now: number = Date.now()
): string | undefined {
	const personnelIds = archive.archivedAt ? [...archive.personnelIds] : [];
	if (personnelIds.length === 0 && archive.requestIds.length === 0) return undefined;
	return signArchiveUndo({
		...who,
		// Requests have no archive time of their own; the token still carries when the call ran.
		archivedAt: archive.archivedAt ?? new Date(now).toISOString(),
		personnelIds,
		requestIds: [...archive.requestIds],
		expiresAt: now + ARCHIVE_UNDO_WINDOW_MS
	});
}
