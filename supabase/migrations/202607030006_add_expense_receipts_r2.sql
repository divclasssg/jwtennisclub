alter table public.expenses
add column if not exists receipt_file_key text,
add column if not exists receipt_file_name text,
add column if not exists receipt_content_type text,
add column if not exists receipt_file_size integer,
add constraint expenses_receipt_file_size_positive check (
  receipt_file_size is null or receipt_file_size > 0
),
add constraint expenses_receipt_content_type_valid check (
  receipt_content_type is null
  or receipt_content_type in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  )
);

create unique index if not exists expenses_receipt_file_key_idx
on public.expenses(receipt_file_key)
where receipt_file_key is not null;
