import { error } from '@sveltejs/kit';
import type { AppShellRouteData, ReadyAppShell } from './orgShell';

export function requireReadyAppShell(data: AppShellRouteData): ReadyAppShell {
	if (data.shell.kind !== 'ready') {
		throw error(403, 'Organization is suspended');
	}

	return data.shell;
}
