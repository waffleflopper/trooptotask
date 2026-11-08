import { describe, expect, it } from 'vitest';
import {
	ARCHIVE_UNDO_WINDOW_MS,
	signArchiveUndo,
	verifyArchiveUndo,
	type ArchiveUndoClaims
} from './archiveUndoToken.server';

const NOW = Date.parse('2026-11-08T12:00:00.000Z');
const claims: ArchiveUndoClaims = {
	orgId: 'org-1',
	actorId: 'user-1',
	archivedAt: '2026-11-08T12:00:00.000Z',
	personnelIds: ['person-1', 'person-2'],
	requestIds: ['request-1'],
	expiresAt: NOW + ARCHIVE_UNDO_WINDOW_MS
};
const me = { orgId: 'org-1', actorId: 'user-1' };

describe('archive Undo token', () => {
	it('returns the signed claims to the person and Organization it was issued to', () => {
		expect(verifyArchiveUndo(signArchiveUndo(claims), me, NOW)).toEqual({ ok: true, claims });
	});

	it('is refused for another person, another Organization, and once it has expired', () => {
		const token = signArchiveUndo(claims);

		expect(verifyArchiveUndo(token, { ...me, actorId: 'user-2' }, NOW)).toEqual({ ok: false, reason: 'other-actor' });
		expect(verifyArchiveUndo(token, { ...me, orgId: 'org-2' }, NOW)).toEqual({
			ok: false,
			reason: 'other-organization'
		});
		expect(verifyArchiveUndo(token, me, claims.expiresAt - 1)).toMatchObject({ ok: true });
		expect(verifyArchiveUndo(token, me, claims.expiresAt)).toEqual({ ok: false, reason: 'expired' });
	});

	it('is refused when the claims or the signature were altered', () => {
		const [payload, given] = signArchiveUndo(claims).split('.');
		const forged = Buffer.from(JSON.stringify({ ...claims, personnelIds: ['person-9'] })).toString('base64url');
		const flipped = `${given.slice(0, -2)}${given.endsWith('AA') ? 'BB' : 'AA'}`;

		for (const token of [
			`${forged}.${given}`,
			`${payload}.${flipped}`,
			`${payload}.`,
			payload,
			`${payload}.${given}.x`
		]) {
			expect(verifyArchiveUndo(token, me, NOW)).toEqual({ ok: false, reason: 'invalid' });
		}
	});

	it.each([undefined, null, 7, {}, '', 'not a token'])('is refused for %j', (token) => {
		expect(verifyArchiveUndo(token, me, NOW)).toEqual({ ok: false, reason: 'invalid' });
	});
});
