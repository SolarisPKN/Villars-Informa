/**
 * Optional, consent-based one-shot WhatsApp Status probe.
 * This is deliberately NOT executed in GitHub-hosted Actions.
 * No collected statuses, WhatsApp account identifiers or auth files enter the public repository.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { allowedPhoneSet, assessStatus, normalizePhone, statusKey, trimmedText } from './logic.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const stateDir = process.env.WA_STATE_DIR;
const confirmedConsent = process.env.WA_STATUS_CONSENT === 'yes';

function ensureSafeStateDir(dir) {
  if (!dir || !path.isAbsolute(dir)) throw new Error('WA_STATE_DIR must be an absolute private directory outside this Git checkout.');
  const candidate = path.resolve(dir);
  if (candidate === root || candidate.startsWith(root + path.sep)) {
    throw new Error('Refusing to put WhatsApp sessions/statuses inside the public repository.');
  }
  return candidate;
}

async function saveDrafts(client, inbox, allowed) {
  const all = await client.getBroadcasts();
  let saved = 0;
  let selectedContacts = 0;
  for (const broadcast of all) {
    let sender;
    try { sender = await broadcast.getContact(); } catch { continue; }
    const phone = normalizePhone(sender?.number);
    if (!allowed.has(phone)) continue;
    selectedContacts += 1;

    for (const message of broadcast.msgs || []) {
      const evaluation = assessStatus(message);
      if (!evaluation.eligible) continue;
      const digest = statusKey(phone, evaluation.messageId);
      const destination = path.join(inbox, digest + '.json');
      try { await fs.access(destination); continue; } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }

      const candidate = {
        schemaVersion: 1,
        state: 'pending-human-review',
        origin: 'whatsapp-status',
        sourceName: process.env.WA_SOURCE_LABEL || 'CAPS Villars',
        // No public WhatsApp link exists for this status; never fabricate one.
        sourceUrl: '',
        capturedAt: new Date().toISOString(),
        postedAt: evaluation.createdAt,
        statusExpiresAt: evaluation.expiresAt,
        content: trimmedText(message.body),
        contentKind: String(message.type || 'unknown'),
        // Consent to VIEW a status is not permission to REPUBLISH images/names.
        publishingAuthorized: false,
        hasMedia: Boolean(message.hasMedia),
        mediaPath: null,
        reviewNotes: 'Confirm service/event date, official provenance and explicit permission before publishing.',
      };

      if (message.hasMedia && typeof message.downloadMedia === 'function') {
        try {
          const media = await message.downloadMedia();
          const permitted = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
          const ext = permitted[media?.mimetype];
          const buffer = ext && typeof media.data === 'string' ? Buffer.from(media.data, 'base64') : null;
          if (buffer && buffer.length <= 8 * 1024 * 1024) {
            const filename = digest + ext;
            await fs.writeFile(path.join(inbox, filename), buffer, { mode: 0o600, flag: 'wx' });
            candidate.mediaPath = filename;
          } else {
            candidate.reviewNotes += ' Media not saved (unsupported or too large).';
          }
        } catch {
          candidate.reviewNotes += ' Could not download media; check manually.';
        }
      }
      await fs.writeFile(destination, JSON.stringify(candidate, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      saved += 1;
    }
  }
  console.log('Status scan: authorized contacts currently visible=' + selectedContacts + '; new local drafts=' + saved);
}

if (!confirmedConsent) throw new Error('Set WA_STATUS_CONSENT=yes only after the CAPS explicitly authorizes collecting its published notices.');
const state = ensureSafeStateDir(stateDir);
const allowed = allowedPhoneSet(process.env.WA_ALLOWED_CONTACTS);
const inbox = path.join(state, 'inbox');
await fs.mkdir(inbox, { recursive: true, mode: 0o700 });
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'villars-health', dataPath: path.join(state, 'auth') }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] },
});

let settled = false;
const timer = setTimeout(async () => {
  if (settled) return;
  settled = true;
  console.error('WhatsApp did not become ready in time. Login might require relinking.');
  process.exitCode = 1;
  await client.destroy().catch(() => {});
}, 120_000);

client.on('qr', (qr) => {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.error('Refusing to print a sensitive WhatsApp QR in GitHub Actions logs.');
    return;
  }
  console.log('Scan this code ON YOUR PRIVATE TERMINAL with the dedicated WhatsApp account:');
  qrcode.generate(qr, { small: true });
});
client.on('auth_failure', () => {
  console.error('WhatsApp authentication failed; re-link the dedicated device locally.');
  process.exitCode = 1;
});
client.once('ready', async () => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  try {
    await saveDrafts(client, inbox, allowed);
  } catch (error) {
    console.error('Status check failed: ' + (error?.message || 'unknown failure'));
    process.exitCode = 1;
  } finally {
    await client.destroy().catch(() => {});
  }
});
try { await client.initialize(); } catch (error) {
  clearTimeout(timer);
  console.error('WhatsApp Web startup failed: ' + (error?.message || 'unknown failure'));
  process.exitCode = 1;
  await client.destroy().catch(() => {});
}
