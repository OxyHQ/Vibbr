# Development

```bash
bun install
docker compose -f docker-compose.postgres.yml up -d postgres
cp packages/backend/.env.example packages/backend/.env   # then edit
DATABASE_URL=postgres://vibbr:vibbr@127.0.0.1:5434/vibbr_dev \
  bun run --cwd packages/backend db:migrate -- --phase=all --target-database=vibbr_dev
bun run dev:backend
bun run dev:frontend
```

The frontend needs `EXPO_PUBLIC_OXY_CLIENT_ID` (Vibbr's registered Oxy application) and, in
development, `EXPO_PUBLIC_API_URL=http://localhost:3000`.

## Environment

| Variable                | Where   | Notes                                                                    |
| ----------------------- | ------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`          | backend | Postgres 17.                                                             |
| `TICKET_CODE_SECRET`    | backend | 32+ characters; required in production. It signs admission codes.        |
| `OXY_API_URL`           | backend | Defaults to `https://api.oxy.so`.                                        |
| `FRONTEND_URL`          | backend | Web origin for CORS and event links.                                     |
| `VIBBR_ONLINE_PAYMENTS` | backend | Unset or `off`. Any other value is refused until the Peable rail exists. |
| `TEST_DATABASE_URL`     | tests   | A server the suites may create throwaway databases on.                   |
