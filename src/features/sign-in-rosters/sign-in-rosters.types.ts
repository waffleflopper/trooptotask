// ============================================================
// Sign-In Rosters
// ============================================================

export interface SignInRoster {
	id: string;
	title: string;
	rosterDate: string | null;
	blankDate: boolean;
	separateByGroup: boolean;
	sortBy: 'alphabetical' | 'rank';
	personnelSnapshot: { id: string; rank: string; lastName: string; firstName: string; group: string }[];
	filterConfig: { groups: string[]; ranks: string[] } | null;
	signedFilePath: string | null;
	createdBy: string;
	createdAt: string;
}
