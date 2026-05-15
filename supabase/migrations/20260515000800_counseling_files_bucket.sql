INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
    'counseling-files',
    'counseling-files',
    false,
    10485760,
    ARRAY['application/pdf']
)
ON CONFLICT ("id") DO UPDATE
SET
    "public" = false,
    "file_size_limit" = EXCLUDED."file_size_limit",
    "allowed_mime_types" = EXCLUDED."allowed_mime_types";
