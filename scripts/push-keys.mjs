// Private keys stay in ignored local files and are piped to Wrangler, never printed.
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import webpush from 'web-push';

mkdirSync('work', {recursive: true});
const path = 'work/push-vapid.json';
let keys;
if (existsSync(path)) keys = JSON.parse(readFileSync(path, 'utf8'));
else {keys = webpush.generateVAPIDKeys(); writeFileSync(path, JSON.stringify(keys), {mode: 0o600});}
const secrets = {VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey};
if (process.argv.includes('--local')) {
  writeFileSync('push-worker/.dev.vars', Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n'), {mode: 0o600});
  console.log('Local push keys prepared (not displayed).');
} else {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk', '--config', 'push-worker/wrangler.jsonc'], {input: JSON.stringify(secrets), encoding: 'utf8'});
  // Wrangler reports only secret names and deployment outcome.
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
  process.exitCode = result.status ?? 1;
}
