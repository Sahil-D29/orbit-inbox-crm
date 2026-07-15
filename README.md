# Unified Gmail and Meta CRM

A production-shaped MVP for a multi-tenant customer inbox covering Gmail,
WhatsApp Business Cloud API, Instagram DMs and comments, and Facebook Page
Messenger. It connects directly to Google and Meta; no messaging aggregator or
webhook proxy is used.

## Current Railway status

The main demo flow is working on Railway.

- Web app: `https://crmweb-production-f3e7.up.railway.app/sign-in`
- API health: `https://crmapi-production-fcd3.up.railway.app/v1/health`
- Demo login: click **Sign in as demo user**
- Demo credentials, if needed manually: `sahil@example.com` / `orbit123`

Working pieces:

- Web, API, worker, PostgreSQL, and Redis services are deployed.
- The API runs Prisma migrations and seeds demo data before starting.
- The sign-in page is styled on desktop/mobile and includes one-click demo login.
- Railway production cookies are configured for the web and API subdomains.
- Web static assets are served through `next start`.

If you change layout or features locally, edit the code in this repo, test it,
then commit and push to GitHub. Railway is connected to GitHub and will deploy
the pushed changes automatically for the affected service.

Typical update flow:

```powershell
git status --short
corepack pnpm --filter @crm/web typecheck
corepack pnpm --filter @crm/web build
git add .
git commit -m "Describe the change"
git push origin master
```

For API/database changes, also run the relevant checks:

```powershell
corepack pnpm --filter @crm/api typecheck
corepack pnpm --filter @crm/database typecheck
```

## What is implemented

- Responsive inbox, conversation view, customer context, Instagram moderation
  queue, saved views, channel settings, and admin/agent presentation.
- Real-time operations dashboard, historical analytics with CSV export, channel
  mix, SLA risk visibility, agent workload and capacity reporting.
- Agent invitations, admin/agent roles, availability, suspension/restoration,
  balanced or round-robin assignment settings, SLAs, business hours, retention,
  and workspace security controls.
- PostgreSQL domain model with tenant-scoped records, deduplication keys,
  reversible contact merges, audit logs, sync cursors, and outbound outbox.
- NestJS REST API, server-sent events, tenant guard, inbox/search endpoints,
  comments moderation, contact merge/undo, provider connections, and webhook
  receivers.
- Direct Gmail and Meta adapter foundations, OAuth URL generation, Meta signature
  verification, Gmail Pub/Sub envelope validation, and WhatsApp 24-hour window
  enforcement.
- BullMQ workers for inbound events, outbound delivery, imports, and
  reconciliation.
- Demo tenant seed for evaluating the full interface without provider access.

Provider credentials, business verification, app review, and public HTTPS
callback URLs are external prerequisites; no repository can manufacture those.

## Run locally

1. Copy `.env.example` to `.env`.
2. Start data services: `docker compose up -d`.
3. Install packages: `pnpm install`.
4. Generate and initialize the database:
   `pnpm db:generate`, `pnpm db:push`, then `pnpm db:seed`.
5. Start all services: `pnpm dev`.
6. Open `http://localhost:3000`.

The web app sends the seeded development tenant and user IDs to the API. This
development identity mechanism is intentionally rejected when `NODE_ENV` is
`production`; production deployment must put verified OIDC/session claims into
the same tenant context.

## Provider setup

### Gmail

Create a Google OAuth web client, enable Gmail API and Pub/Sub, configure the
redirect URI, create the Pub/Sub topic, and grant Gmail's publishing service
account permission. Set the Google variables in `.env`. Production access to
restricted Gmail scopes requires Google's verification process.

### Meta

Create a Meta business app with WhatsApp, Instagram, and Messenger products.
Configure the callback URLs to `/v1/webhooks/meta`, use the configured verify
token, subscribe the relevant WhatsApp Business Account, Instagram professional
account, and Facebook Page fields, and set the Meta variables in `.env`.
Production use requires Meta business verification and the relevant advanced
permissions/app review.

## Deployment

The project is currently deployed on Railway as separate services:

- `@crm/web`
- `@crm/api`
- `@crm/worker`
- `Postgres`
- `Redis`

Railway builds from GitHub `master`. Push changes to GitHub to update the live
deployment. The API service start command runs migrations and seed data before
starting the NestJS API, so a fresh Railway database can initialize itself.

## Security boundary

Tokens are encrypted before persistence. The included local encryption provider
uses AES-256-GCM and exists for development; production should replace its key
unwrap operation with Cloud KMS. Attachments require malware scanning before
public delivery. PostgreSQL RLS migration SQL is included and the API also
enforces tenant predicates at every query boundary.
