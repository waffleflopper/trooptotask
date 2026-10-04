export interface IdentityPlatformAccountStatistics {
	total: number;
	last30Days: number;
}

export interface IdentityPlatformSignupPoint {
	date: string;
	count: number;
}

export interface IdentityPlatformDashboardReader {
	countPlatformUsers(): Promise<IdentityPlatformAccountStatistics>;
	listDailySignupsLast30Days(): Promise<IdentityPlatformSignupPoint[]>;
	countPendingAccessRequests(): Promise<number>;
}
