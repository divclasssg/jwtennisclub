create or replace function public.load_club_meeting_directory_page(
  requested_period_month date,
  requested_selected_meeting_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.prepare_club_meeting_month(requested_period_month);

  return public.get_club_meeting_directory_page(
    requested_period_month,
    requested_selected_meeting_id
  );
end;
$$;

revoke execute on function public.load_club_meeting_directory_page(date, text) from public, anon;
grant execute on function public.load_club_meeting_directory_page(date, text) to authenticated;
