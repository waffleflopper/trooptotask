DROP POLICY IF EXISTS "Org members can read counseling files" ON "storage"."objects";
DROP POLICY IF EXISTS "Personnel editors can delete counseling files" ON "storage"."objects";
DROP POLICY IF EXISTS "Personnel editors can update counseling files" ON "storage"."objects";
DROP POLICY IF EXISTS "Personnel editors can upload counseling files" ON "storage"."objects";
DROP POLICY IF EXISTS "Users can delete counseling files if can edit personnel" ON "storage"."objects";
DROP POLICY IF EXISTS "Users can update counseling files if can edit personnel" ON "storage"."objects";
DROP POLICY IF EXISTS "Users can upload counseling files if can edit personnel" ON "storage"."objects";
DROP POLICY IF EXISTS "Users can view counseling files if can view personnel" ON "storage"."objects";
