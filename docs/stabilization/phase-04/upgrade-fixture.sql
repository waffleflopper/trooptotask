-- D01 preparation only. Run ONCE, only in a newly created owned disposable replay.
-- No private data, old seed, trigger disabling, conflict suppression or cleanup SQL.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT FROM auth.users) OR EXISTS (SELECT FROM public.organizations) THEN
    RAISE EXCEPTION 'Fixture requires an empty disposable replay';
  END IF;
END $$;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) VALUES
('c4010000-0000-4000-8000-000000000001','phase04-owner@example.test','2035-01-01Z','{"provider":"email"}','{"billing":"retained metadata","profile":{"source":"synthetic"}}'),
('c4010000-0000-4000-8000-000000000002','phase04-operator@example.test','2035-01-01Z','{}','{}'),
('c4010000-0000-4000-8000-000000000003','phase04-foreign@example.test','2035-01-01Z','{}','{}'),
('c4010000-0000-4000-8000-000000000004','phase04-billing@example.test','2035-01-01Z','{}','{}'),
('c4010000-0000-4000-8000-000000000005','phase04-suspended@example.test','2035-01-01Z','{}','{}'),
('c4010000-0000-4000-8000-000000000006','phase04-admin@example.test','2035-01-01Z','{}','{}'),
('c4010000-0000-4000-8000-000000000007','phase04-invitee@example.test','2035-01-01Z','{}','{}');
INSERT INTO public.organizations(id,name,created_by,url_slug,tier,stripe_customer_id,stripe_subscription_id,subscription_status,current_period_end,gift_tier,gift_expires_at,gifted_by,archive_retention_months,personnel_document_storage_cap_bytes) VALUES
('c4010000-0000-4000-8000-000000000008','Phase 04 Alpha','c4010000-0000-4000-8000-000000000001','phase04-alpha','team','cus_synthetic_phase04','sub_synthetic_phase04','past_due','2035-02-01Z','unit','2035-03-01Z','c4010000-0000-4000-8000-000000000001',24,52428800),
('c4010000-0000-4000-8000-000000000009','Phase 04 Foreign','c4010000-0000-4000-8000-000000000003','phase04-foreign','free',NULL,NULL,'active',NULL,NULL,NULL,NULL,36,104857600);
INSERT INTO public.organizations(id,name,created_by,url_slug,suspended_at) VALUES
('c4010000-0000-4000-8000-000000000010','Phase 04 Suspended','c4010000-0000-4000-8000-000000000001','phase04-suspended','2035-01-01Z');
INSERT INTO public.groups(id,organization_id,name) VALUES
('c4010000-0000-4000-8000-000000000011','c4010000-0000-4000-8000-000000000008','Alpha'),('c4010000-0000-4000-8000-000000000012','c4010000-0000-4000-8000-000000000008','Bravo'),('c4010000-0000-4000-8000-000000000013','c4010000-0000-4000-8000-000000000009','Foreign');
INSERT INTO public.organization_memberships(id,organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids) VALUES
('c4010000-0000-4000-8000-000000000041','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000001','owner','editor','{}','organization','{}'),
('c4010000-0000-4000-8000-000000000042','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000002','member','operator','{"calendar":"operate","training":"operate","personnel":"operate"}','groups',ARRAY['c4010000-0000-4000-8000-000000000011']::uuid[]),
('c4010000-0000-4000-8000-000000000043','c4010000-0000-4000-8000-000000000009','c4010000-0000-4000-8000-000000000003','owner','editor','{}','organization','{}'),
('c4010000-0000-4000-8000-000000000044','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000006','admin','editor','{}','organization','{}');
INSERT INTO public.platform_admins(id,user_id,role) VALUES ('c4010000-0000-4000-8000-000000000037','c4010000-0000-4000-8000-000000000004','billing');
INSERT INTO public.user_suspensions(user_id,suspended_by,suspended_at,reason) VALUES ('c4010000-0000-4000-8000-000000000005','c4010000-0000-4000-8000-000000000001','2035-01-01Z','Synthetic suspension');
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,clinic_role,mos,slug) VALUES
('c4010000-0000-4000-8000-000000000014','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000011','SGT','Synthetic','Alpha','Respiratory Therapist','68V','phase04-alpha'),
('c4010000-0000-4000-8000-000000000015','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000012','SGT','Synthetic','Bravo','Medic','68W','phase04-bravo'),
('c4010000-0000-4000-8000-000000000016','c4010000-0000-4000-8000-000000000009','c4010000-0000-4000-8000-000000000013','SGT','Synthetic','Foreign','Medic','68W','phase04-foreign');
INSERT INTO public.assignment_types(id,organization_id,name,short_name,assign_to) VALUES
('c4010000-0000-4000-8000-000000000017','c4010000-0000-4000-8000-000000000008','Clinic coverage','CLIN','personnel'),('c4010000-0000-4000-8000-000000000018','c4010000-0000-4000-8000-000000000008','Group coverage','GRP','group');
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES
('c4010000-0000-4000-8000-000000000019','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000017','2035-01-10','c4010000-0000-4000-8000-000000000014'),
('c4010000-0000-4000-8000-000000000020','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000018','2035-01-10','c4010000-0000-4000-8000-000000000011'),
('c4010000-0000-4000-8000-000000000021','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000017','2035-01-11','c4010000-0000-4000-8000-000000000015');
INSERT INTO public.status_types(id,organization_id,name,color,text_color) VALUES ('c4010000-0000-4000-8000-000000000023','c4010000-0000-4000-8000-000000000008','Leave','#ffffff','#000000');
INSERT INTO public.availability_entries(id,organization_id,personnel_id,status_type_id,start_date,end_date) VALUES
('c4010000-0000-4000-8000-000000000024','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000014','c4010000-0000-4000-8000-000000000023','2035-01-12','2035-01-13');
INSERT INTO public.special_days(id,organization_id,date,name,type) VALUES ('c4010000-0000-4000-8000-000000000025','c4010000-0000-4000-8000-000000000008','2035-01-14','Synthetic Holiday','federal-holiday');
INSERT INTO public.organization_rank_catalog(id,organization_id,code,label,service,category,pay_grade) VALUES ('c4010000-0000-4000-8000-000000000026','c4010000-0000-4000-8000-000000000008','SGT','Sergeant','army','enlisted','E-5');
INSERT INTO public.sign_in_rosters(id,organization_id,title,roster_date,personnel_snapshot,personnel_ids,scope_group_ids,signed_file_path,created_by) VALUES
('c4010000-0000-4000-8000-000000000027','c4010000-0000-4000-8000-000000000008','Independent Alpha Roster','2035-01-10',jsonb_build_array(jsonb_build_object('id','c4010000-0000-4000-8000-000000000014','groupId','c4010000-0000-4000-8000-000000000011','clinicRole','Respiratory Therapist')),ARRAY['c4010000-0000-4000-8000-000000000014']::uuid[],ARRAY['c4010000-0000-4000-8000-000000000011']::uuid[],'synthetic/phase04/alpha-signed.pdf','c4010000-0000-4000-8000-000000000001'),
('c4010000-0000-4000-8000-000000000028','c4010000-0000-4000-8000-000000000008','Independent Bravo Roster','2035-01-10',jsonb_build_array(jsonb_build_object('id','c4010000-0000-4000-8000-000000000015','groupId','c4010000-0000-4000-8000-000000000012')),ARRAY['c4010000-0000-4000-8000-000000000015']::uuid[],ARRAY['c4010000-0000-4000-8000-000000000012']::uuid[],'synthetic/phase04/bravo-signed.pdf','c4010000-0000-4000-8000-000000000001');
INSERT INTO public.data_exports(id,org_id,requested_by,status,file_path,file_size_bytes,completed_at) VALUES
('c4010000-0000-4000-8000-000000000029','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000001','completed','synthetic/phase04/export.zip',4096,'2035-01-10Z');
INSERT INTO public.audit_logs(id,timestamp,user_id,org_id,action,resource_type,resource_id,details) VALUES
('c4010000-0000-4000-8000-000000000030','2035-01-10Z','c4010000-0000-4000-8000-000000000001','c4010000-0000-4000-8000-000000000008','data_export.completed','data_export','c4010000-0000-4000-8000-000000000029','{"billing":{"historical":true},"retained":{"fileSizeBytes":4096}}');
INSERT INTO public.organization_invitations(id,organization_id,email,invited_by,status,expires_at,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids) VALUES
('c4010000-0000-4000-8000-000000000031','c4010000-0000-4000-8000-000000000008',' Phase04-Pending@example.test ','c4010000-0000-4000-8000-000000000001','pending','2099-01-01Z','operator','{"calendar":"operate"}','groups',ARRAY['c4010000-0000-4000-8000-000000000011']::uuid[]);
INSERT INTO public.organization_invitations(id,organization_id,email,invited_by,status,expires_at,blocked_at,blocked_by) VALUES
('c4010000-0000-4000-8000-000000000032','c4010000-0000-4000-8000-000000000008','phase04-blocked@example.test','c4010000-0000-4000-8000-000000000001','blocked','2035-01-15Z','2035-01-10Z','c4010000-0000-4000-8000-000000000001');
INSERT INTO public.organization_invitations(id,organization_id,email,invited_by,status,expires_at,accepted_at,accepted_by) VALUES
('c4010000-0000-4000-8000-000000000033','c4010000-0000-4000-8000-000000000008','phase04-invitee@example.test','c4010000-0000-4000-8000-000000000001','accepted','2035-01-15Z','2035-01-10Z','c4010000-0000-4000-8000-000000000007');
INSERT INTO public.organization_invitation_email_outbox(id,organization_id,invitation_id,recipient,status,attempt_count,sent_at) VALUES
('c4010000-0000-4000-8000-000000000034','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000031','phase04-pending@example.test','sent',1,'2035-01-10Z');
INSERT INTO public.access_requests(id,email,name,status,reviewed_by,reviewed_at,setup_completed_at,setup_user_id) VALUES
('c4010000-0000-4000-8000-000000000035','phase04-invitee@example.test','Synthetic Invitee','approved','c4010000-0000-4000-8000-000000000001','2035-01-01Z','2035-01-10Z','c4010000-0000-4000-8000-000000000007');
INSERT INTO public.access_request_organization_invitation_links(id,access_request_id,organization_invitation_id,organization_id,invited_by,invited_at,intended_membership_role,intended_access_scope_kind,intended_permissions) VALUES
('c4010000-0000-4000-8000-000000000036','c4010000-0000-4000-8000-000000000035','c4010000-0000-4000-8000-000000000033','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000001','2035-01-01Z','member','organization','{"billing":"historical shared JSON must survive"}');
-- Representative stored commercial facts: no assumption that any candidate table is empty.
INSERT INTO public.organization_billing_snapshots(id,organization_id,commercial_plan,stripe_customer_id,stripe_subscription_id,subscription_status,sync_status,last_stripe_event_id) VALUES
('c4010000-0000-4000-8000-000000000038','c4010000-0000-4000-8000-000000000008','team','cus_synthetic_phase04','sub_synthetic_phase04','past_due','synced','evt_synthetic_phase04');
INSERT INTO public.organization_checkout_attempts(id,organization_id,stripe_checkout_session_id,commercial_plan,stripe_price_id,status) VALUES
('c4010000-0000-4000-8000-000000000039','c4010000-0000-4000-8000-000000000008','cs_synthetic_phase04','team','price_synthetic_phase04','completed');
INSERT INTO public.organization_plan_feature_overrides(id,organization_id,feature_key,override_state,reason,created_by) VALUES
('c4010000-0000-4000-8000-000000000040','c4010000-0000-4000-8000-000000000008','synthetic-feature','granted','Synthetic historical override','c4010000-0000-4000-8000-000000000001');
INSERT INTO public.stripe_webhook_events(id,type,data,processed,processing_state,attempt_count) VALUES
('evt_synthetic_phase04','customer.subscription.updated','{"object":{"id":"sub_synthetic_phase04"},"synthetic":true}',true,'processed',1);
INSERT INTO public.organization_memberships(id,organization_id,user_id,role) VALUES
('c4010000-0000-4000-8000-000000000050','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000007','member');
-- Billing retirement must also preserve already saved duty-origin Calendar facts.
INSERT INTO public.duty_roster_templates(id,organization_id,name,slug,assignment_type_id) VALUES
('c4010000-0000-4000-8000-000000000051','c4010000-0000-4000-8000-000000000008','Synthetic saved duty origin','phase04-duty','c4010000-0000-4000-8000-000000000017');
INSERT INTO public.duty_roster_template_runs(id,organization_id,template_id,template_name,start_date,end_date,snapshot_payload) VALUES
('c4010000-0000-4000-8000-000000000052','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000051','Synthetic saved duty origin','2035-01-01','2035-01-31','{"assignments":[{"date":"2035-01-20","personnelId":"c4010000-0000-4000-8000-000000000014"}]}');
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id,duty_roster_template_run_id,duty_roster_template_run_row_date) VALUES
('c4010000-0000-4000-8000-000000000053','c4010000-0000-4000-8000-000000000008','c4010000-0000-4000-8000-000000000017','2035-01-20','c4010000-0000-4000-8000-000000000015','c4010000-0000-4000-8000-000000000052','2035-01-20');
COMMIT;
