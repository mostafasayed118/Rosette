const serverKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PAYMOB_API_KEY',
  'PAYMOB_PUBLIC_KEY',
  'PAYMOB_INTEGRATION_ID',
  'PAYMOB_HMAC_SECRET',
  'PAYMOB_BASE_URL',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'GMAIL_FROM',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'WHATSAPP_BUSINESS_NUMBER',
] as const;

type ServerKey = (typeof serverKeys)[number];

export function getOptionalServerEnv(key: ServerKey) {
  return process.env[key] || undefined;
}

export function getRequiredServerEnv(key: ServerKey) {
  const value = getOptionalServerEnv(key);
  if (!value) throw new Error(`Missing server environment variable: ${key}`);
  return value;
}
