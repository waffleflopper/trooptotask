import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { postImportChunk } from './importChunkRequest';

const schema = z.object({ inserted: z.number() });
const post = () =>
	postImportChunk('/org/org-1/api/import', { rows: [] }, { fallbackMessage: 'Import failed.', schema });

describe('postImportChunk', () => {
	afterEach(() => vi.unstubAllGlobals());

	it.each([
		['a saved reply', () => Response.json({ inserted: 3 }), { kind: 'saved', data: { inserted: 3 } }],
		[
			'a refusal with a reason',
			() => Response.json({ message: 'Row 2 has no date.' }, { status: 422 }),
			{ kind: 'refused', message: 'Row 2 has no date.' }
		],
		[
			'a refusal without a reason',
			() => new Response('', { status: 403 }),
			{ kind: 'refused', message: 'Import failed.' }
		],
		['a server failure', () => Response.json({ message: 'boom' }, { status: 502 }), { kind: 'unconfirmed' }],
		['a saved reply it cannot read', () => Response.json({ inserted: 'three' }), { kind: 'unconfirmed' }],
		[
			'a lost reply',
			() => {
				throw new TypeError('fetch failed');
			},
			{ kind: 'unconfirmed' }
		]
	])('reads %s', async (_name, reply, expected) => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => reply())
		);

		await expect(post()).resolves.toEqual(expected);
	});
});
