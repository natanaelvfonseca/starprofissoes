type QueryClient = {
  query: <T extends { total: string }>(
    sql: string,
    params: Array<unknown>,
  ) => Promise<{ rows: Array<T> }>;
};

export async function countActiveUnitConsultants(client: QueryClient, unitId: string) {
  const result = await client.query<{ total: string }>(
    `
      select count(*)::text as total
      from app_users user_account
      where user_account.role = 'CONSULTOR'
        and user_account.status = 'active'
        and (
          user_account.primary_unit_id = $1
          or exists (
            select 1
            from app_user_units user_unit
            where user_unit.user_id = user_account.id
              and user_unit.unit_id = $1
          )
        )
    `,
    [unitId],
  );

  return Number(result.rows[0]?.total ?? 0);
}
