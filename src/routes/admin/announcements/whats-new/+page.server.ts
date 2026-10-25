import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createPlatformWhatsNewOperations } from '$features/platform-admin/index.server';

const ENTRY_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/;

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformWhatsNewOperations(event);
	return {
		entries: operations.list().then(
			(entries) => ({ status: 'loaded' as const, entries }),
			(cause) => {
				console.error("Failed to load What's New entries", cause);
				return { status: 'failed' as const };
			}
		)
	};
};

async function readEntry(request: Request) {
	const formData = await request.formData();
	const id = String(formData.get('id') ?? '');
	const publishOn = formData.get('publishOn');
	return {
		id: id === '' ? null : id,
		title: String(formData.get('title') ?? ''),
		paragraphs: formData.getAll('paragraph').map(String),
		publishOn: publishOn === null ? undefined : String(publishOn)
	};
}

export const actions: Actions = {
	save: async (event) => {
		const operations = await createPlatformWhatsNewOperations(event);
		const input = await readEntry(event.request);
		if (input.id !== null && !ENTRY_ID.test(input.id)) return fail(400, { error: 'Invalid entry ID' });
		try {
			const result = await operations.save(input);
			if (result.status === 'invalid') return fail(400, { error: result.error });
			if (result.status === 'not_found') return fail(404, { error: 'Entry not found' });
			return { success: true, id: result.id, published: result.published };
		} catch (cause) {
			console.error("Failed to save What's New entry", cause);
			return fail(500, { error: 'Failed to save entry' });
		}
	},
	delete: async (event) => {
		const operations = await createPlatformWhatsNewOperations(event);
		const formData = await event.request.formData();
		const id = String(formData.get('id') ?? '');
		if (!ENTRY_ID.test(id)) return fail(400, { error: 'Invalid entry ID' });
		try {
			const result = await operations.deleteEntry(id);
			if (result.status === 'not_found') return fail(404, { error: 'Entry not found' });
			return { success: true, deleted: true };
		} catch (cause) {
			console.error("Failed to delete What's New entry", cause);
			return fail(500, { error: 'Failed to delete entry' });
		}
	}
};
