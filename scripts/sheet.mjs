#!/usr/bin/env node
// Read and write the trip Google Sheet with the service account. No npm install needed.
// Set SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON (base64 of the key JSON, or the raw JSON).
//
//   node scripts/sheet.mjs tabs
//   node scripts/sheet.mjs get "'📅 Itinerary'!A1:N20"
//   node scripts/sheet.mjs set "'📅 Itinerary'!M12" '[["note"]]'
//   node scripts/sheet.mjs append "'📝 Change Log'!A:F" '[["a","b"]]'
import { createSign } from 'node:crypto';

const SHEET_ID = process.env.SHEET_ID;
if (!SHEET_ID) throw new Error("Set SHEET_ID to the id in your sheet's address");
const RAW = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const key = RAW ? JSON.parse(RAW.trim().startsWith('{') ? RAW : Buffer.from(RAW, 'base64').toString('utf8')) : null;

const b64url = (s) => Buffer.from(s).toString('base64url');

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(key.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${sig}`,
    }),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function api(path, init = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    ...init,
    headers: { ...(key && { Authorization: `Bearer ${await token()}` }), 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json();
}

const [cmd, range, json] = process.argv.slice(2);
const r = encodeURIComponent(range ?? '');
const opt = 'valueInputOption=USER_ENTERED';

switch (cmd) {
  case 'tabs': {
    const out = await api('?fields=sheets.properties(title,gridProperties)');
    for (const s of out.sheets) console.log(`${s.properties.title}\t${s.properties.gridProperties.rowCount} rows`);
    break;
  }
  case 'get': {
    const out = await api(`/values/${r}`);
    (out.values ?? []).forEach((row, i) => console.log(i, JSON.stringify(row)));
    break;
  }
  case 'formulas': {
    const out = await api(`/values/${r}?valueRenderOption=FORMULA`);
    (out.values ?? []).forEach((row, i) => console.log(i, JSON.stringify(row)));
    break;
  }
  case 'set': {
    const out = await api(`/values/${r}?${opt}`, { method: 'PUT', body: JSON.stringify({ values: JSON.parse(json) }) });
    console.log('updated', out.updatedRange, out.updatedCells, 'cells');
    break;
  }
  case 'append': {
    const out = await api(`/values/${r}:append?${opt}&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: JSON.parse(json) }),
    });
    console.log('appended', out.updates.updatedRange);
    break;
  }
  default:
    console.error('usage: tabs | get <range> | formulas <range> | set <range> <json> | append <range> <json>');
    process.exit(1);
}
