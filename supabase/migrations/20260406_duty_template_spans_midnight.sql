alter table duty_templates
  add column if not exists spans_midnight boolean not null default false;
