export interface SliceWidgetConfig {
	placement: 'aboveEditor';
	windowSize: number;
}

export interface GitHubSlicesConfig {
	repo: string;
	issues: number[];
	widget: SliceWidgetConfig;
}

export interface SliceIssue {
	number: number;
	title: string;
	state: string;
	url: string;
	labels: string[];
	body: string;
	blockedBy: number[];
	isBlocked: boolean;
}

export type WorkflowMode = 'manual' | 'tdd' | 'verify-work';

export interface SliceSessionState {
	activeIssueNumber?: number;
	activeWorkflow?: WorkflowMode;
	updatedAt: string;
}

export interface EntryLike {
	type: string;
	customType?: string;
	data?: unknown;
}

export interface LatestVerifyState {
	ok: boolean;
	failedStep?: string;
	completedAt: string;
}

export interface SliceWidgetModel {
	config?: GitHubSlicesConfig;
	issues: SliceIssue[];
	activeIssueNumber?: number;
	activeWorkflow?: WorkflowMode;
	latestVerify?: LatestVerifyState;
	metadataError?: string;
}

export interface PickerSliceItem {
	number: number;
	title: string;
	state: string;
	isActive: boolean;
	isBlocked: boolean;
}
