begin;
select plan(7);

create temporary table task8_inventory_fixture (
  version text not null,
  name text not null,
  statements text[]
) on commit drop;

insert into task8_inventory_fixture(version, name, statements) values
  ('202607130001', 'optimize_navigation_queries', null),
  ('202608020001', 'match_foundation', array['select 1;']::text[]);

create temporary view task8_inventory_projection as
select
  version,
  name,
  case when statements is null then 'unavailable' else 'recorded' end
    as statements_state,
  case
    when statements is null then null
    else encode(
      extensions.digest(array_to_string(statements, E'\n'), 'sha256'),
      'hex'
    )
  end as statement_sha256,
  jsonb_build_object(
    'version', version,
    'name', name,
    'statements', statements
  )::text as catalog_json,
  encode(
    extensions.digest(
      jsonb_build_object(
        'version', version,
        'name', name,
        'statements', statements
      )::text,
      'sha256'
    ),
    'hex'
  ) as catalog_sha256
from task8_inventory_fixture;

select is(
  (
    select statements_state
    from task8_inventory_projection
    where version = '202607130001'
  ),
  'unavailable',
  'null statements are unavailable'
);

select is(
  (
    select statement_sha256
    from task8_inventory_projection
    where version = '202607130001'
  ),
  null,
  'unavailable statements have no statement hash'
);

select is(
  (
    select statements_state
    from task8_inventory_projection
    where version = '202608020001'
  ),
  'recorded',
  'stored statements are recorded'
);

select is(
  (
    select statement_sha256
    from task8_inventory_projection
    where version = '202608020001'
  ),
  encode(extensions.digest('select 1;', 'sha256'), 'hex'),
  'recorded statements hash the newline-joined SQL text'
);

select is(
  (
    select catalog_json
    from task8_inventory_projection
    where version = '202607130001'
  ),
  '{"name": "optimize_navigation_queries", "version": "202607130001", "statements": null}',
  'catalog canonical JSON includes explicit null statements'
);

select ok(
  (
    select bool_and(catalog_sha256 ~ '^[a-f0-9]{64}$')
    from task8_inventory_projection
  ),
  'every catalog row has a lowercase SHA-256'
);

select is(
  (
    select array_agg(version order by version)
    from task8_inventory_projection
  ),
  array['202607130001', '202608020001']::text[],
  'migration rows have a deterministic ascending order'
);

select * from finish();
rollback;
