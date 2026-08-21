# Cloudflare deployment — remaining manual steps

Everything code-side is done. These are the credentials that must come from a
browser login or a provider dashboard, plus the exact CLI commands to finish.

Current state (verified via CLI):

- Supabase migrations `001`–`017` — **already applied** to project `vwjqtwxqangblapnmtbm`
- GitHub Actions secrets — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` **set**
- `.env.local` — now also holds `GIFT_CARD_SECRET`, `EMAIL_PREFERENCES_SECRET`,
  `DEPLOYMENT_RUNTIME`, `PAYMENT_MODE`, `EMAIL_DELIVERY_MODE` (gitignored)
- Wrangler — **not authenticated**; this is the only blocker left

---

## 1. Authenticate Wrangler

Interactive browser login (simplest):

```powershell
npx wrangler login
```

Or use a scoped API token instead, which is what CI needs anyway:

1. Open <https://dash.cloudflare.com/profile/api-tokens>
2. **Create Token → Edit Cloudflare Workers** template
3. Scope it to your account and (if you use one) your zone, then create
4. Copy the token once — it is never shown again

Account ID: <https://dash.cloudflare.com> → **Workers & Pages** → the
**Account ID** field in the right sidebar.

```powershell
$env:CLOUDFLARE_API_TOKEN = "<token>"
$env:CLOUDFLARE_ACCOUNT_ID = "<account id>"
npx wrangler whoami        # should now print your account
```

---

## 2. Push runtime secrets to the Worker

Server-only values are Worker secrets, not build-time env. Run from the repo root:

```powershell
$vals = @{}
Get-Content .env.local | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object {
  $i = $_.IndexOf('='); $vals[$_.Substring(0, $i)] = $_.Substring($i + 1).Trim('"').Trim("'")
}
$runtime = @(
  'SUPABASE_SERVICE_ROLE_KEY','PAYMOB_API_KEY','PAYMOB_PUBLIC_KEY','PAYMOB_INTEGRATION_ID',
  'PAYMOB_HMAC_SECRET','PAYMOB_BASE_URL','GMAIL_USER','GMAIL_APP_PASSWORD','GMAIL_FROM',
  'GROQ_API_KEY','GROQ_MODEL','WHATSAPP_BUSINESS_NUMBER','SITE_URL','CRON_SECRET',
  'GIFT_CARD_SECRET','EMAIL_PREFERENCES_SECRET','DEPLOYMENT_RUNTIME','PAYMENT_MODE',
  'EMAIL_DELIVERY_MODE','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'
)
foreach ($key in $runtime) {
  if ($vals[$key]) { $vals[$key] | npx wrangler secret put $key }
}
npx wrangler secret list
```

---

## 3. Add the two CI secrets to GitHub

```powershell
"<token>"      | gh secret set CLOUDFLARE_API_TOKEN
"<account id>" | gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret list
```

---

## 4. Deploy

```powershell
npm run cf:deploy          # build + size check + deploy
# or let CI do it:
gh workflow run "Deploy to Cloudflare"
gh run watch
```

---

## 5. Post-deploy checks

```powershell
# Replace with your workers.dev or custom domain
curl.exe -I https://rosette.<subdomain>.workers.dev/en/cairo
npx wrangler tail            # live structured logs from lib/logger.ts
```

Then in the browser:

- `/en/cairo` — hero renders, images served from `/_next/image`
- `/en/cairo/shop?page=2` — pagination works
- Place a test order and confirm `payment.webhook.processed` appears in
  `wrangler tail`

---

## Where each missing key comes from

| Key | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | <https://dash.cloudflare.com/profile/api-tokens> → Edit Cloudflare Workers template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dash → Workers & Pages → right sidebar |
| `GIFT_CARD_SECRET` | Generated locally; already in `.env.local` |
| `EMAIL_PREFERENCES_SECRET` | Generated locally; already in `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dash → Project Settings → API → `service_role` |
| `PAYMOB_*` | Paymob dash → Settings → Account Info / Payment Integrations; HMAC lives under Integration details |
| `GMAIL_APP_PASSWORD` | Google Account → Security → 2-Step Verification → App passwords |
| `GROQ_API_KEY` | <https://console.groq.com/keys> |
| `SITE_URL` | Your production origin, e.g. `https://rosette.example.com` — must match the Paymob callback URL |

Cron triggers are declared in `wrangler.jsonc`; they start firing once the
Worker is deployed and `CRON_SECRET` is set.
