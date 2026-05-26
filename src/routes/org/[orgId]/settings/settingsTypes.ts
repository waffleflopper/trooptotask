export type PlanUsageSummaryForSettings = {
	rows: Array<{
		dimension: string;
		label: string;
		used: number;
		limitLabel: string;
		status: string;
		message: string;
		remediation: string;
	}>;
	alerts: Array<{
		dimension: string;
		label: string;
		message: string;
		remediation: string;
		status: string;
	}>;
};
