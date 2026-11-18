-- bunryu reports under its Server Name, a free-form label whose default is "Bunryu". The
-- first schema only allowed lowercase letters, digits and "-", so every report from a
-- bunryu with a capital or a space in its name was refused. Accept any name of 1-80
-- characters with no control characters, which is what bunryu itself allows.

alter table public.ingest_instances
  drop constraint ingest_instances_instance_check;

alter table public.ingest_instances
  add constraint ingest_instances_instance_check
  check (char_length(instance) between 1 and 80 and instance !~ '[[:cntrl:]]');
