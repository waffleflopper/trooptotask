-- Add GitHub issue tracking and page section columns to beta_feedback
ALTER TABLE "public"."beta_feedback"
  ADD COLUMN IF NOT EXISTS "github_issue_number" integer,
  ADD COLUMN IF NOT EXISTS "github_issue_url" text,
  ADD COLUMN IF NOT EXISTS "page_section" text;
