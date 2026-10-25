export interface PlatformUserDirectoryListItem {
	id: string;
	email: string | null;
	organizationCount: number;
	createdAt: string;
	isSuspended: boolean;
	emailConfirmedAt: string | null;
	emailConfirmationStatus: 'confirmed' | 'pending';
}

export interface PlatformUserDirectoryList {
	users: PlatformUserDirectoryListItem[];
	totalCount: number;
	page: number;
	limit: number;
	search: string;
	authError: string | null;
}
