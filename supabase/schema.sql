-- Canonical schema. Deploy the matching generated migration to Supabase.
create schema if not exists private;
create table public.users (
 id uuid primary key references auth.users(id), name text not null, email text not null unique,
 role text not null default 'member' check(role in ('admin','member','viewer')),
 active boolean not null default false, global_member boolean not null default false
);
create table public.notification_preferences (
 user_id uuid primary key references public.users(id), in_app boolean not null default true,
 email boolean not null default false, calendar boolean not null default true,
 admin_critical boolean not null default false
);
create table public.hackathons (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 organizer text not null, timezone text not null default 'Asia/Kolkata',
 created_by uuid not null references public.users(id), archived boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.hackathon_members (
 hackathon_id uuid references public.hackathons(id), user_id uuid references public.users(id),
 active boolean not null default true, global_inclusion boolean not null default false,
 primary key(hackathon_id,user_id)
);
create table public.deadlines (
 id uuid primary key default gen_random_uuid(), hackathon_id uuid not null references public.hackathons(id),
 kind text not null check(kind in ('Registration','PPT','Prototype','Final submission','Presentation','Result')),
 due_date date not null, revision integer not null default 1, completed_at timestamptz,
 unique(hackathon_id,kind)
);
create table public.submissions (
 deadline_id uuid primary key references public.deadlines(id), submitted_by uuid not null references public.users(id),
 submitted_at timestamptz not null default now(), url text, notes text
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), hackathon_id uuid not null references public.hackathons(id),
 title text not null, assigned_to uuid not null references public.users(id), due_date date not null,
 completed_at timestamptz, revision integer not null default 1
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
 hackathon_id uuid not null references public.hackathons(id), deadline_id uuid references public.deadlines(id),
 task_id uuid references public.tasks(id), revision integer not null, stage text not null,
 message text not null, idempotency_key text not null unique,
 in_app boolean not null, email_status text not null check(email_status in ('off','pending','sending','sent','cancelled','held')),
 created_at timestamptz not null default now(), read_at timestamptz,
 first_attempt_at timestamptz, lease_until timestamptz, claim_token uuid, sent_at timestamptz, last_error text
);
create index notifications_pending on public.notifications(email_status,created_at);
create index notifications_recipient on public.notifications(user_id,created_at desc);
create index member_user on public.hackathon_members(user_id);
create table public.activity_logs (
 id uuid primary key default gen_random_uuid(), hackathon_id uuid references public.hackathons(id),
 actor_id uuid not null references public.users(id), action text not null, details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create table public.calendar_connections (
 user_id uuid primary key references public.users(id), refresh_token_encrypted text not null,
 connected_at timestamptz not null default now()
);
create table public.calendar_events (
 deadline_id uuid references public.deadlines(id), user_id uuid references public.users(id),
 generation integer not null default 1, google_event_id text, synced_revision integer,
 last_synced_at timestamptz, last_error text, primary key(deadline_id,user_id)
);
create table public.worker_locks (name text primary key, token uuid not null, expires_at timestamptz not null);

create function private.bootstrap_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.users(id,name,email) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),new.email);
 insert into public.notification_preferences(user_id) values(new.id);
 return new;
end $$;
create trigger auth_user_created after insert on auth.users for each row execute function private.bootstrap_user();

-- These narrow helpers resolve table policy recursion; no writes or user-supplied actor IDs.
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.users where id=auth.uid() and active and role='admin')
$$;
create function private.can_read(h uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and (private.is_admin() or exists(select 1 from public.hackathon_members m join public.users u on u.id=m.user_id where m.hackathon_id=h and m.user_id=auth.uid() and m.active and u.active))
$$;
grant usage on schema private to authenticated;
revoke all on function private.bootstrap_user() from public;
revoke all on function private.is_admin(), private.can_read(uuid) from public;
grant execute on function private.is_admin(), private.can_read(uuid) to authenticated;

alter table public.users enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.hackathons enable row level security;
alter table public.hackathon_members enable row level security;
alter table public.deadlines enable row level security;
alter table public.submissions enable row level security;
alter table public.tasks enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_events enable row level security;
alter table public.worker_locks enable row level security;
create function private.is_active() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.users where id=auth.uid() and active)
$$;
revoke all on function private.is_active() from public;
grant execute on function private.is_active() to authenticated;
create policy directory on public.users for select to authenticated using(id=auth.uid() or private.is_admin() or (active and private.is_active()));
create policy preference_read on public.notification_preferences for select to authenticated using(user_id=auth.uid());
create policy hackathon_read on public.hackathons for select to authenticated using(private.can_read(id));
create policy membership_read on public.hackathon_members for select to authenticated using(private.can_read(hackathon_id));
create policy deadline_read on public.deadlines for select to authenticated using(private.can_read(hackathon_id));
create policy submission_read on public.submissions for select to authenticated using(exists(select 1 from public.deadlines d where d.id=deadline_id and private.can_read(d.hackathon_id)));
create policy task_read on public.tasks for select to authenticated using(private.can_read(hackathon_id));
create policy notification_read on public.notifications for select to authenticated using(user_id=auth.uid() and private.is_active());
create policy activity_read on public.activity_logs for select to authenticated using(private.can_read(hackathon_id) or private.is_admin());
create policy calendar_read on public.calendar_events for select to authenticated using(user_id=auth.uid() and private.is_active());
revoke all on all tables in schema public from anon,authenticated;
grant select on public.users,public.notification_preferences,public.hackathons,public.hackathon_members,public.deadlines,public.submissions,public.tasks,public.notifications,public.activity_logs,public.calendar_events to authenticated;
grant all on all tables in schema public to service_role;

-- Mutations and scheduled work use the same transaction lock to serialize eligibility changes.
create function public.mutate(actor uuid, operation text, payload jsonb) returns uuid language plpgsql set search_path = public as $$
declare
 me public.users; h public.hackathons; d public.deadlines; t public.tasks; target uuid; result uuid;
 old_date date; item jsonb; member_id uuid;
begin
 perform pg_advisory_xact_lock(713829);
 select * into me from public.users where id=actor and active;
 if me.id is null then raise exception 'Active account required'; end if;
 if operation='calendar_retry' then
  update public.calendar_events set synced_revision=null,last_synced_at=null where user_id=actor;
  return actor;
 end if;
 if operation='preferences' then
  update public.notification_preferences set in_app=(payload->>'in_app')::boolean,email=(payload->>'email')::boolean,calendar=(payload->>'calendar')::boolean,
   admin_critical=case when me.role='admin' then (payload->>'admin_critical')::boolean else false end where user_id=actor;
  return actor;
 end if;
 if operation='read' then update public.notifications set read_at=now() where user_id=actor and id=(payload->>'id')::uuid; return actor; end if;
 if me.role='viewer' then raise exception 'Viewers have read-only access'; end if;
 if operation='user' then
  if me.role <> 'admin' then raise exception 'Admin required'; end if;
  target := (payload->>'id')::uuid;
  if target=actor and (payload->>'role'<>'admin' or not (payload->>'active')::boolean) then raise exception 'Cannot deactivate or demote yourself'; end if;
  update public.users set role=payload->>'role',active=(payload->>'active')::boolean,global_member=(payload->>'global_member')::boolean where id=target;
  insert into public.activity_logs(actor_id,action,details) values(actor,'User updated',payload);
  return target;
 end if;
 if operation='create' then
  if not exists(select 1 from pg_timezone_names where name=payload->>'timezone') then raise exception 'Invalid timezone'; end if;
  insert into public.hackathons(name,organizer,timezone,created_by) values(payload->>'name',payload->>'organizer',payload->>'timezone',actor) returning id into result;
  insert into public.hackathon_members(hackathon_id,user_id,global_inclusion)
   select result,id,global_member from public.users where active and (id=actor or global_member or id in (select value::uuid from jsonb_array_elements_text(payload->'members')));
  for item in select value from jsonb_array_elements(payload->'deadlines') loop
   insert into public.deadlines(hackathon_id,kind,due_date) values(result,item->>'kind',(item->>'due_date')::date);
  end loop;
  insert into public.activity_logs(hackathon_id,actor_id,action) values(result,actor,'Hackathon created');
  return result;
 end if;
 select * into h from public.hackathons where id=(payload->>'hackathon_id')::uuid;
 if h.id is null or h.archived then raise exception 'Hackathon not available'; end if;
 if me.role<>'admin' and not exists(select 1 from public.hackathon_members where hackathon_id=h.id and user_id=actor and active) then raise exception 'Active membership required'; end if;
 if operation in ('member','deadline','add_deadline','task') and me.role<>'admin' and h.created_by<>actor then raise exception 'Owner or admin required'; end if;
 if operation='member' then
  target := (payload->>'user_id')::uuid;
  if (payload->>'active')::boolean and not exists(select 1 from public.users where id=target and active) then raise exception 'Active user required'; end if;
  if not (payload->>'active')::boolean and (target=h.created_by or (me.role<>'admin' and exists(select 1 from public.hackathon_members where hackathon_id=h.id and user_id=target and global_inclusion))) then raise exception 'Cannot remove owner or protected global member'; end if;
  insert into public.hackathon_members(hackathon_id,user_id,active) values(h.id,target,(payload->>'active')::boolean)
   on conflict(hackathon_id,user_id) do update set active=excluded.active;
  insert into public.activity_logs(hackathon_id,actor_id,action,details) values(h.id,actor,'Membership changed',payload);
 elsif operation='add_deadline' then
  insert into public.deadlines(hackathon_id,kind,due_date) values(h.id,payload->>'kind',(payload->>'due_date')::date) returning * into d;
  insert into public.activity_logs(hackathon_id,actor_id,action,details) values(h.id,actor,'Deadline added',payload);
 elsif operation='deadline' then
  select * into d from public.deadlines where id=(payload->>'id')::uuid and hackathon_id=h.id;
  if d.id is null or d.completed_at is not null then raise exception 'Open deadline required'; end if;
  if d.due_date=(payload->>'due_date')::date then return h.id; end if;
  old_date := d.due_date;
  update public.deadlines set due_date=(payload->>'due_date')::date,revision=revision+1 where id=d.id returning * into d;
  perform public.emit_deadline(d.id,'changed',d.kind||' deadline changed: '||to_char(old_date,'DD Mon')||' → '||to_char(d.due_date,'DD Mon')||' — '||h.name,false);
  insert into public.activity_logs(hackathon_id,actor_id,action,details) values(h.id,actor,'Deadline changed',jsonb_build_object('old',old_date,'new',d.due_date,'deadline_id',d.id));
 elsif operation='submit' then
  select * into d from public.deadlines where id=(payload->>'id')::uuid and hackathon_id=h.id;
  if d.id is null then raise exception 'Deadline not found'; end if;
  if d.completed_at is not null then return h.id; end if;
  insert into public.submissions(deadline_id,submitted_by,url,notes) values(d.id,actor,payload->>'url',payload->>'notes');
  update public.deadlines set completed_at=now() where id=d.id;
  if coalesce((payload->>'notify')::boolean,false) then perform public.emit_deadline(d.id,'completed','✅ '||h.name||' '||d.kind||' has been submitted by '||me.name||'.',false); end if;
  insert into public.activity_logs(hackathon_id,actor_id,action,details) values(h.id,actor,'Submission completed',jsonb_build_object('deadline_id',d.id));
 elsif operation='task' then
  target := (payload->>'assigned_to')::uuid;
  if not exists(select 1 from public.hackathon_members m join public.users u on u.id=m.user_id where m.hackathon_id=h.id and m.user_id=target and m.active and u.active and u.role<>'viewer') then raise exception 'Assignee must be an active writable member'; end if;
  insert into public.tasks(hackathon_id,title,assigned_to,due_date) values(h.id,payload->>'title',target,(payload->>'due_date')::date) returning * into t;
  perform public.emit_task(t.id,'assigned','Task assigned: '||t.title||' — '||h.name);
  insert into public.activity_logs(hackathon_id,actor_id,action) values(h.id,actor,'Task assigned');
 elsif operation='task_done' then
  select * into t from public.tasks where id=(payload->>'id')::uuid and hackathon_id=h.id;
  if t.id is null or (me.role<>'admin' and actor not in (t.assigned_to,h.created_by)) then raise exception 'Task permission denied'; end if;
  if t.completed_at is null then
   update public.tasks set completed_at=now() where id=t.id;
   insert into public.activity_logs(hackathon_id,actor_id,action) values(h.id,actor,'Task completed');
  end if;
 else raise exception 'Unknown operation';
 end if;
 -- Cancel pending work after a membership/date/completion change; history is retained.
 update public.notifications n set email_status='cancelled',lease_until=null where email_status in ('pending','sending') and not public.notification_eligible(n.id);
 return h.id;
end $$;

create function public.emit_deadline(did uuid, reminder_stage text, body text, critical boolean) returns void language sql set search_path = public as $$
 insert into public.notifications(user_id,hackathon_id,deadline_id,revision,stage,message,idempotency_key,in_app,email_status)
 select u.id,d.hackathon_id,d.id,d.revision,reminder_stage,body,
  'deadline:'||d.id||':'||d.revision||':'||reminder_stage||':'||u.id,p.in_app,case when p.email then 'pending' else 'off' end
 from public.deadlines d cross join public.users u join public.notification_preferences p on p.user_id=u.id
 where d.id=did and u.active and (exists(select 1 from public.hackathon_members m where m.hackathon_id=d.hackathon_id and m.user_id=u.id and m.active) or (critical and u.role='admin' and p.admin_critical))
 on conflict(idempotency_key) do nothing
$$;
create function public.emit_task(tid uuid, reminder_stage text, body text) returns void language sql set search_path = public as $$
 insert into public.notifications(user_id,hackathon_id,task_id,revision,stage,message,idempotency_key,in_app,email_status)
 select u.id,t.hackathon_id,t.id,t.revision,reminder_stage,body,
  'task:'||t.id||':'||t.revision||':'||reminder_stage||':'||u.id,p.in_app,case when p.email then 'pending' else 'off' end
 from public.tasks t join public.users u on u.id=t.assigned_to join public.notification_preferences p on p.user_id=u.id
 join public.hackathon_members m on m.user_id=u.id and m.hackathon_id=t.hackathon_id
 where t.id=tid and u.active and m.active on conflict(idempotency_key) do nothing
$$;
create function public.notification_eligible(nid uuid) returns boolean language sql stable set search_path = public as $$
 select coalesce((select u.active and not h.archived and
  (case when n.deadline_id is not null then
   d.revision=n.revision and (n.stage='completed' or d.completed_at is null) and
   (n.stage in ('changed','completed','1hr') or n.stage=case when d.due_date<(now() at time zone h.timezone)::date then 'overdue' else (d.due_date-(now() at time zone h.timezone)::date)::text end) and
   (exists(select 1 from public.hackathon_members m where m.hackathon_id=h.id and m.user_id=u.id and m.active) or (n.stage in ('1','0','1hr','overdue') and u.role='admin' and p.admin_critical))
  else t.assigned_to=u.id and t.revision=n.revision and t.completed_at is null and
   (n.stage in ('assigned','1hr') or n.stage=case when t.due_date<(now() at time zone h.timezone)::date then 'overdue' else (t.due_date-(now() at time zone h.timezone)::date)::text end) and
   exists(select 1 from public.hackathon_members m where m.hackathon_id=h.id and m.user_id=u.id and m.active) end)
 from public.notifications n join public.users u on u.id=n.user_id join public.notification_preferences p on p.user_id=u.id
 join public.hackathons h on h.id=n.hackathon_id left join public.deadlines d on d.id=n.deadline_id left join public.tasks t on t.id=n.task_id where n.id=nid),false)
$$;
create function public.generate_reminders(at_time timestamptz default now()) returns integer language plpgsql set search_path = public as $$
declare r record; days integer; stage text; suffix text; before_count integer;
begin
 perform pg_advisory_xact_lock(713829);
 select count(*) into before_count from public.notifications;
 for r in select d.*,h.name,h.timezone from public.deadlines d join public.hackathons h on h.id=d.hackathon_id where d.completed_at is null and not h.archived loop
  days := r.due_date-(at_time at time zone r.timezone)::date;
  stage := case when days<0 then 'overdue' when days in (7,3,1,0) then days::text end;
  if stage is not null then
   suffix := case when days<0 then ' is overdue' when days=0 then ' TODAY' when days=1 then ' tomorrow' else ' in '||days||' days' end;
   perform public.emit_deadline(r.id,stage,(case when days<=1 then '🔴 ' else '🔔 ' end)||r.name||' — '||r.kind||case when r.kind in ('PPT','Prototype') then ' submission' else '' end||suffix,days<=1);
  end if;
  if days=0 and extract(hour from (at_time at time zone r.timezone)) = 23 then
   perform public.emit_deadline(r.id,'1hr','🚨 '||r.name||' — '||r.kind||case when r.kind in ('PPT','Prototype') then ' submission' else '' end||' — 1 HOUR LEFT!',true);
  end if;
 end loop;
 for r in select t.*,h.name,h.timezone from public.tasks t join public.hackathons h on h.id=t.hackathon_id where t.completed_at is null and not h.archived loop
  days := r.due_date-(at_time at time zone r.timezone)::date;
  stage := case when days<0 then 'overdue' when days in (1,0) then days::text end;
  if stage is not null then perform public.emit_task(r.id,stage,'🔔 '||r.title||case when days<0 then ' is overdue' when days=0 then ' is due TODAY' else ' is due tomorrow' end||' — '||r.name); end if;
  if days=0 and extract(hour from (at_time at time zone r.timezone)) = 23 then perform public.emit_task(r.id,'1hr','🚨 '||r.title||' — 1 HOUR LEFT! — '||r.name); end if;
 end loop;
 update public.notifications n set email_status='cancelled' where email_status in ('pending','sending') and not public.notification_eligible(n.id);
 return (select count(*)::integer-before_count from public.notifications);
end $$;
create function public.claim_email() returns setof public.notifications language plpgsql set search_path = public as $$
declare chosen uuid;
begin
 perform pg_advisory_xact_lock(713829);
 update public.notifications set email_status='held',last_error='Idempotency retry window expired; inspect provider history' where email_status in ('pending','sending') and first_attempt_at < now()-interval '23 hours';
 select n.id into chosen from public.notifications n join public.notification_preferences p on p.user_id=n.user_id
 where n.email_status in ('pending','sending') and (n.lease_until is null or n.lease_until<now()) and p.email and public.notification_eligible(n.id)
 order by n.created_at for update of n skip locked limit 1;
 return query update public.notifications set email_status='sending',claim_token=gen_random_uuid(),first_attempt_at=coalesce(first_attempt_at,now()),lease_until=now()+interval '2 minutes' where id=chosen returning *;
end $$;
create function public.acquire_worker(lock_name text, lock_token uuid) returns boolean language plpgsql set search_path = public as $$
begin
 insert into public.worker_locks values(lock_name,lock_token,now()+interval '2 minutes')
 on conflict(name) do update set token=excluded.token,expires_at=excluded.expires_at where worker_locks.expires_at<now();
 return found;
end $$;

revoke all on function public.mutate(uuid,text,jsonb), public.emit_deadline(uuid,text,text,boolean), public.emit_task(uuid,text,text), public.notification_eligible(uuid), public.generate_reminders(timestamptz), public.claim_email(), public.acquire_worker(text,uuid) from public,anon,authenticated;
grant execute on function public.mutate(uuid,text,jsonb), public.emit_deadline(uuid,text,text,boolean), public.emit_task(uuid,text,text), public.notification_eligible(uuid), public.generate_reminders(timestamptz), public.claim_email(), public.acquire_worker(text,uuid) to service_role;
