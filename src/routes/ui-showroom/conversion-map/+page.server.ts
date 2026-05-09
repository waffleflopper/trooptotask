import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

export function load() {
	if (!dev) {
		error(404, 'UI showroom conversion map is only available in development.');
	}
}
