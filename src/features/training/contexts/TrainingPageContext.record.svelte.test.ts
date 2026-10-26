// @vitest-environment happy-dom
import { createClientAccess } from '$lib/access/clientAccess';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { personnelRosterHydration } from '$features/personnel';
import { groupCatalogHydration } from '$features/personnel';
import { trainingRankCatalogStore } from '$features/training/stores/rankCatalog.svelte';
import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { TrainingPageContext } from './TrainingPageContext.svelte';

const { gotoMock, pageMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	pageMock: { url: new URL('http://localhost/org/org-1/training'), state: {} as Record<string, unknown> }
}));

vi.mock('$app/navigation', () => ({ goto: gotoMock, invalidate: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$app/state', () => ({ page: pageMock }));

function person(id: string, lastName: string): Personnel {
	return {
		id,
		firstName: 'Pat',
		lastName,
		rank: 'SGT',
		mos: '68W',
		clinicRole: '',
		groupId: 'g-1',
		groupName: 'Alpha'
	};
}
const mockPerson = person('p-1', 'Smith');
const mockPerson2 = person('p-2', 'Adams');

function org(training: 'configure' | 'view') {
	return {
		orgId: 'test-org',
		orgUrlSegment: 'test-org',
		...createClientAccess({
			membershipRole: 'member',
			capabilityMap: { ...createCapabilityMap('none'), training }
		})
	};
}
const makeOrg = () => org('configure');
const makeData = () => ({ orgId: 'org-1', orgName: 'Test Org', isOwner: false, isAdmin: false });
const modals = new ModalRegistry();

function makeContext(data: ReturnType<typeof makeData>, _modals: ModalRegistry, access: ReturnType<typeof org>) {
	return new TrainingPageContext(data, _modals, access, vi.fn().mockResolvedValue(true), vi.fn());
}

describe('TrainingPageContext record sheet', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		personnelRosterHydration.load([mockPerson, mockPerson2], 'org-1');
		groupCatalogHydration.load([{ id: 'g-1', name: 'Alpha', sortOrder: 0 }], 'org-1');
		trainingRankCatalogStore.load([], 'org-1');
		trainingViewsStore.load([], 'org-1');
		trainingTypesStore.load([], 'org-1');
		personnelTrainingsStore.load([], 'org-1');
	});

	describe('the open record (?person=)', () => {
		type Entry = { url: URL; state: Record<string, unknown> };
		let entries: Entry[];
		let at: number;

		function show(entry: Entry) {
			pageMock.url = entry.url;
			pageMock.state = entry.state;
		}

		beforeEach(() => {
			entries = [{ url: new URL('http://localhost/org/org-1/training'), state: {} }];
			at = 0;
			show(entries[0]);
			gotoMock.mockReset().mockImplementation(async (href: string, options: Record<string, unknown> = {}) => {
				const entry = {
					url: new URL(href, 'http://localhost'),
					state: (options.state as Record<string, unknown> | undefined) ?? {}
				};
				if (options.replaceState) entries[at] = entry;
				else entries.splice(++at, entries.length, entry);
				show(entries[at]);
			});
			vi.spyOn(history, 'back').mockImplementation(() => show(entries[--at]));
		});

		const openOnLoad = (personId: string) => {
			entries[0] = { url: new URL(`http://localhost/org/org-1/training?person=${personId}`), state: {} };
			show(entries[0]);
		};

		it('pushes a history entry that opens the record for the clicked Soldier', async () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.handlePersonClick(mockPerson);
			await Promise.resolve();

			expect(pageMock.url.searchParams.get('person')).toBe('p-1');
			expect(ctx.recordPerson?.id).toBe('p-1');
			expect(entries).toHaveLength(2);
		});

		it('closes by going back, which removes the param and the sheet', async () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.handlePersonClick(mockPerson);
			await Promise.resolve();

			ctx.closeRecord();

			expect(pageMock.url.searchParams.has('person')).toBe(false);
			expect(ctx.recordPerson).toBeNull();
		});

		it('keeps the page entry when the sheet was opened by a link and only strips the param on close', async () => {
			openOnLoad('p-2');
			const ctx = makeContext(makeData(), modals, makeOrg());
			expect(ctx.recordPerson?.id).toBe('p-2');

			ctx.closeRecord();
			await Promise.resolve();

			expect(history.back).not.toHaveBeenCalled();
			expect(ctx.recordPerson).toBeNull();
			expect(entries).toHaveLength(1);
		});

		it('names an unknown Soldier without opening anything', () => {
			openOnLoad('nobody');
			const ctx = makeContext(makeData(), modals, makeOrg());

			expect(ctx.recordPersonId).toBe('nobody');
			expect(ctx.recordPerson).toBeNull();
		});

		it('opens nothing for a viewer who cannot record training', () => {
			openOnLoad('p-1');
			const ctx = makeContext(makeData(), modals, org('view'));

			expect(ctx.recordPerson).toBeNull();
		});

		it('steps through the order the matrix reported, replacing the entry instead of stacking one', async () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.rowOrder = ['p-2', 'p-1'];
			ctx.handlePersonClick(mockPerson2);
			await Promise.resolve();
			expect(ctx.recordNeighbours.previous).toBeNull();
			expect(ctx.recordNeighbours.next?.id).toBe('p-1');

			ctx.stepRecord(1);
			await Promise.resolve();

			expect(ctx.recordPerson?.id).toBe('p-1');
			expect(entries).toHaveLength(2);
			expect(ctx.recordNeighbours.next).toBeNull();
			expect(ctx.recordNeighbours.previous?.id).toBe('p-2');

			ctx.stepRecord(1);
			await Promise.resolve();
			expect(ctx.recordPerson?.id).toBe('p-1');
		});

		it('still closes with Back after stepping', async () => {
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.rowOrder = ['p-2', 'p-1'];
			ctx.handlePersonClick(mockPerson2);
			await Promise.resolve();
			ctx.stepRecord(1);
			await Promise.resolve();

			ctx.closeRecord();

			expect(ctx.recordPerson).toBeNull();
			expect(entries).toHaveLength(2);
		});

		it('returns focus to the control that opened the record', async () => {
			const opener = document.createElement('button');
			document.body.append(opener);
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.handlePersonClick(mockPerson, opener);

			await ctx.restoreRecordFocus();

			expect(document.activeElement).toBe(opener);
			opener.remove();
		});

		it('falls back to the open Soldier name when the opener scrolled out of the matrix', async () => {
			const name = document.createElement('button');
			name.dataset.personOpener = 'p-1';
			const gone = document.createElement('button');
			document.body.append(name);
			const ctx = makeContext(makeData(), modals, makeOrg());
			ctx.handlePersonClick(mockPerson, gone);

			await ctx.restoreRecordFocus();

			expect(document.activeElement).toBe(name);
			name.remove();
		});
	});
});
