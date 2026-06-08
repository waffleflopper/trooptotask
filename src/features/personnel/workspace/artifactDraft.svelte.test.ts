import { describe, expect, it, vi } from 'vitest';
import { ArtifactDraft, type ArtifactDraftSpec } from './artifactDraft.svelte';

interface DraftInput {
	title: string;
	notes: string;
}

interface DraftRecord {
	id: string;
	title: string;
	notes: string;
}

function makeSpec(
	overrides: Partial<ArtifactDraftSpec<DraftInput, DraftRecord>> = {}
): ArtifactDraftSpec<DraftInput, DraftRecord> {
	return {
		createEmptyInput: () => ({ title: '', notes: '' }),
		endpoint: ({ orgId, personId }) => `/org/${orgId}/api/personnel/${personId}/artifacts`,
		validate: (input) => (input.title.trim() ? null : 'Enter a title.'),
		encode: (input) => ({
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: input.title.trim(), notes: input.notes.trim() })
		}),
		errorFallback: 'Unable to create artifact.',
		...overrides
	} satisfies ArtifactDraftSpec<DraftInput, DraftRecord>;
}

describe('ArtifactDraft', () => {
	it('keeps validation failures inside the draft interface', async () => {
		const fetchMock = vi.fn();
		const draft = new ArtifactDraft(makeSpec(), {
			context: { orgId: 'org-1', personId: 'person-1' },
			fetch: fetchMock as typeof fetch
		});

		await draft.submit();

		expect(fetchMock).not.toHaveBeenCalled();
		expect(draft.error).toBe('Enter a title.');
		expect(draft.saving).toBe(false);
	});

	it('surfaces failed responses without clearing draft fields', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false });
		const draft = new ArtifactDraft(makeSpec(), {
			context: { orgId: 'org-1', personId: 'person-1' },
			fetch: fetchMock as typeof fetch
		});
		draft.fields.title = 'Needs follow-up';

		await draft.submit();

		expect(draft.error).toBe('Unable to create artifact.');
		expect(draft.fields.title).toBe('Needs follow-up');
		expect(draft.items).toEqual([]);
	});

	it('posts encoded drafts, clears fields, and deduplicates created items by id', async () => {
		const created = { id: 'artifact-1', title: 'Needs follow-up', notes: 'Bring checklist' };
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(created)
		});
		const draft = new ArtifactDraft(makeSpec(), {
			context: { orgId: 'org-1', personId: 'person-1' },
			fetch: fetchMock as typeof fetch
		});
		draft.items = [
			{ id: 'artifact-1', title: 'Older value', notes: '' },
			{ id: 'artifact-2', title: 'Keep me', notes: '' }
		];
		draft.fields.title = ' Needs follow-up ';
		draft.fields.notes = ' Bring checklist ';

		await draft.submit();

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/artifacts', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'Needs follow-up', notes: 'Bring checklist' })
		});
		expect(draft.fields).toEqual({ title: '', notes: '' });
		expect(draft.items).toEqual([created, { id: 'artifact-2', title: 'Keep me', notes: '' }]);
	});

	it('passes FormData bodies through without JSON headers', async () => {
		const file = new File(['record'], 'record.pdf', { type: 'application/pdf' });
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ id: 'artifact-1', title: 'Record', notes: '' })
		});
		const draft = new ArtifactDraft(
			makeSpec({
				validate: () => null,
				encode: () => {
					const formData = new FormData();
					formData.set('file', file);
					formData.set('title', 'Record');
					return { body: formData };
				}
			}),
			{
				context: { orgId: 'org-1', personId: 'person-1' },
				fetch: fetchMock as typeof fetch
			}
		);

		await draft.submit();

		const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
		expect(request.headers).toBeUndefined();
		expect(request.body).toBeInstanceOf(FormData);
		expect((request.body as FormData).get('file')).toBe(file);
	});
});
