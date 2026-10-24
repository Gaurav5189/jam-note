## Railway deployment

Create a Railway service from this repository and set its **Root Directory** to
`apps/fastapi-backend`. Railway will use `railway.toml`, build the
`Containerfile`, and route health checks to `/health`.

Set these service variables in Railway:

```text
MONGODB_URL=<your MongoDB connection string>
DATABASE_NAME=jam_note
JWT_SECRET=<at least 32 random characters>
ENVIRONMENT=production
CORS_ORIGINS=["https://<your-vercel-domain>"]
```

Set `OPENSEARCH_URL`, `OPENSEARCH_USER`, and `OPENSEARCH_PASSWORD` if search
is enabled in the deployment. Railway provides `PORT` automatically; the
container uses it and falls back to `8000` for local runs.

After deploying the backend, set the Vercel frontend variable
`NEXT_PUBLIC_API_URL` to the Railway service URL.
