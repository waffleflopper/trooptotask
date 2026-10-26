import { SvelteMap, SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
import { validateSensitiveFileSelection } from '$lib/storage/sensitiveFiles';
import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import { rosterCreatedRange } from '../rosterCreatedRange';
import type { SignInRoster } from '../sign-in-rosters.types';

const PAGE_SIZE = 20;
const LOAD_FAILED = 'Unable to load sign-in rosters.';
const ROSTER_UNAVAILABLE = 'This roster is no longer available.';

function failureMessage(payload: unknown, fallback: string) {
	if (typeof payload !== 'object' || payload === null || !('message' in payload)) return fallback;
	return typeof payload.message === 'string' && payload.message ? payload.message : fallback;
}

function cleanupNotice(payload: { fileCleanup?: string }) {
	return payload.fileCleanup === 'pending' ? '. Its stored file will be removed automatically.' : '';
}

/** The saved rosters, their signed scans and the list's filters. Nothing is written after `dispose()`. */
export class RosterList {
	rosters = $state<SignInRoster[]>([]);
	total = $state(0);
	loading = $state(true);
	loadError = $state('');
	searchTitle = $state('');
	dateFrom = $state('');
	dateTo = $state('');
	deleting = $state<string | null>(null);
	deleteError = $state('');
	readonly uploading = new SvelteSet<string>();
	readonly removing = new SvelteSet<string>();
	readonly scanErrors = new SvelteMap<string, string>();
	readonly uploadingNames = new SvelteMap<string, string>();

	readonly busy = $derived(this.uploading.size > 0 || this.removing.size > 0 || this.deleting !== null);
	readonly hasFilters = $derived(!!this.searchTitle || !!this.dateFrom || !!this.dateTo);
	readonly waitingOnScan = $derived(this.rosters.filter((roster) => !roster.signedFilePath).length);

	#orgId: string;
	#disposed = false;
	#loadVersion = 0;
	#searchTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(orgId: string) {
		this.#orgId = orgId;
	}

	dispose() {
		this.#disposed = true;
		clearTimeout(this.#searchTimer);
	}

	#scanUrl(rosterId: string) {
		return `/org/${this.#orgId}/api/sign-in-rosters/${rosterId}/upload`;
	}

	#alive() {
		const inOrganization = stillInOrganizationLifetime();
		return () => !this.#disposed && inOrganization();
	}

	async load(reset = false) {
		const alive = this.#alive();
		const version = ++this.#loadVersion;
		if (reset) this.rosters = [];
		this.loading = true;
		this.loadError = '';
		const params = new SvelteURLSearchParams({
			limit: String(PAGE_SIZE),
			offset: String(reset ? 0 : this.rosters.length)
		});
		if (this.searchTitle) params.set('title', this.searchTitle);
		for (const [key, value] of Object.entries(rosterCreatedRange(this.dateFrom, this.dateTo))) params.set(key, value);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/sign-in-rosters?${params}`);
			const data = (await res.json().catch(() => ({}))) as {
				rosters?: SignInRoster[];
				total?: number;
				message?: unknown;
			};
			if (!alive() || version !== this.#loadVersion) return;
			if (!res.ok || !Array.isArray(data.rosters)) throw new Error(failureMessage(data, LOAD_FAILED));
			this.rosters = reset ? data.rosters : [...this.rosters, ...data.rosters];
			this.total = typeof data.total === 'number' ? data.total : this.rosters.length;
			this.loading = false;
		} catch (err) {
			if (!alive() || version !== this.#loadVersion) return;
			this.total = this.rosters.length;
			this.loadError = err instanceof Error ? err.message : LOAD_FAILED;
			this.loading = false;
		}
	}

	searchSoon() {
		clearTimeout(this.#searchTimer);
		this.#searchTimer = setTimeout(() => void this.load(true), 300);
	}

	clearFilters() {
		this.searchTitle = '';
		this.dateFrom = '';
		this.dateTo = '';
		void this.load(true);
	}

	#patch(id: string, change: Partial<SignInRoster>) {
		this.rosters = this.rosters.map((roster) => (roster.id === id ? { ...roster, ...change } : roster));
	}

	#drop(id: string) {
		if (!this.rosters.some((roster) => roster.id === id)) return;
		this.rosters = this.rosters.filter((roster) => roster.id !== id);
		this.total--;
	}

	#dropUnavailable(id: string) {
		this.#drop(id);
		toastStore.error(ROSTER_UNAVAILABLE);
	}

	async uploadScan(roster: SignInRoster, file: File) {
		if (this.uploading.has(roster.id) || this.removing.has(roster.id)) return;
		const validationError = validateSensitiveFileSelection(file);
		if (validationError) {
			this.scanErrors.set(roster.id, validationError);
			return;
		}

		const alive = this.#alive();
		this.scanErrors.delete(roster.id);
		this.uploadingNames.set(roster.id, file.name);
		this.uploading.add(roster.id);
		try {
			const formData = new FormData();
			formData.append('file', file);
			const response = await withinOrganizationLifetime(
				fetch(this.#scanUrl(roster.id), { method: 'POST', body: formData })
			);
			const payload = (await withinOrganizationLifetime(response.json().catch(() => ({})))) as {
				filePath?: string;
				message?: unknown;
			};
			if (this.#disposed) return;
			if (response.status === 404) {
				this.#dropUnavailable(roster.id);
				return;
			}
			if (!response.ok || !payload.filePath) throw new Error(failureMessage(payload, 'Upload failed.'));
			this.#patch(roster.id, { signedFilePath: payload.filePath });
			toastStore.success('Signed scan uploaded');
		} catch (err: unknown) {
			if (alive()) this.scanErrors.set(roster.id, err instanceof Error ? err.message : 'Upload failed.');
		} finally {
			this.uploading.delete(roster.id);
			this.uploadingNames.delete(roster.id);
		}
	}

	async downloadScan(roster: SignInRoster) {
		if (!roster.signedFilePath) return;
		const alive = this.#alive();
		this.scanErrors.delete(roster.id);
		const url = await fetch(this.#scanUrl(roster.id))
			.then(async (response) => (response.ok ? ((await response.json()) as { url?: string }).url : undefined))
			.catch(() => undefined);
		if (!alive()) return;
		if (!url) {
			this.scanErrors.set(roster.id, 'Could not generate download link.');
			return;
		}
		window.open(url, '_blank');
	}

	async removeScan(roster: SignInRoster) {
		if (!roster.signedFilePath || this.uploading.has(roster.id) || this.removing.has(roster.id)) return;

		this.removing.add(roster.id);
		try {
			const response = await withinOrganizationLifetime(
				fetch(this.#scanUrl(roster.id), {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ filePath: roster.signedFilePath })
				})
			);
			const payload = (await withinOrganizationLifetime(response.json().catch(() => ({})))) as {
				message?: unknown;
				fileCleanup?: string;
			};
			if (this.#disposed) return;
			if (response.status === 404) {
				this.#dropUnavailable(roster.id);
				return;
			}
			if (response.status === 409) {
				this.scanErrors.set(roster.id, failureMessage(payload, 'This signed scan changed. Reload to review it.'));
				void this.load(true);
				return;
			}
			if (!response.ok) throw new Error(failureMessage(payload, 'Remove failed.'));
			this.scanErrors.delete(roster.id);
			this.#patch(roster.id, { signedFilePath: null });
			toastStore.success(`Signed scan removed${cleanupNotice(payload)}`);
		} catch (err: unknown) {
			if (!this.#disposed) this.scanErrors.set(roster.id, err instanceof Error ? err.message : 'Remove failed.');
		} finally {
			this.removing.delete(roster.id);
		}
	}

	/** Resolves true once the roster is gone, so the caller can close its confirm. */
	async deleteRoster(roster: SignInRoster): Promise<boolean> {
		this.deleting = roster.id;
		this.deleteError = '';
		try {
			const res = await withinOrganizationLifetime(
				fetch(`/org/${this.#orgId}/api/sign-in-rosters/${roster.id}`, { method: 'DELETE' })
			);
			const payload = (await withinOrganizationLifetime(res.json().catch(() => ({})))) as {
				message?: unknown;
				fileCleanup?: string;
			};
			if (this.#disposed) return false;
			if (res.status === 404) {
				this.#dropUnavailable(roster.id);
				return true;
			}
			if (!res.ok) {
				this.deleteError = failureMessage(payload, 'Unable to delete roster.');
				return false;
			}
			this.#drop(roster.id);
			toastStore.success(`Roster deleted${cleanupNotice(payload)}`);
			return true;
		} catch {
			if (!this.#disposed) this.deleteError = 'Unable to delete roster.';
			return false;
		} finally {
			this.deleting = null;
		}
	}
}
