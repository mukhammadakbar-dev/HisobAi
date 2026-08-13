#!/usr/bin/env node
/**
 * HisobAI'ni haydash uchun driver (agent yo'li).
 *
 * Uchta buyruq:
 *   smoke                  — login + asosiy ekranlarni aylanib chiqish + screenshot
 *   shot <yo'l> [nom]      — bitta sahifani ochib screenshot olish
 *   api <METOD> <yo'l> [json]  — autentifikatsiyalangan REST chaqiruvi
 *
 * Nega Playwright, `chromium-cli` emas: bu muhitda `chromium-cli` yo'q,
 * lekin tizimda chromium bor. Driver paketni topolmasa, uni /tmp ga
 * o'zi o'rnatadi — repo va lockfile tegilmaydi.
 *
 * Nega sessiya faylga saqlanadi: `POST /auth/login` da 5 urinish / 15
 * daqiqa cheklovi bor (`API.md` §6). Har ishga tushirishda qaytadan
 * kirilsa, bir necha urinishdan keyin `429` boshlanadi va uni faqat
 * API'ni qayta ishga tushirish tozalaydi (throttler xotirada).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = process.env.HISOBAI_REPO ?? process.cwd();
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';

const WORK = join(tmpdir(), 'hisobai-run');
const SHOTS = join(WORK, 'screenshots');
const STATE = join(WORK, 'state.json');
const API_STATE = join(WORK, 'api-cookies.json');
const DEPS = join(WORK, 'deps');

mkdirSync(SHOTS, { recursive: true });

// ───────────────────────────── Yordamchilar ─────────────────────────────

/** `apps/api/.env` — ADMIN_EMAIL/ADMIN_PASSWORD shu yerda (seed qo'ygan ega). */
function env() {
  const file = join(REPO, 'apps/api/.env');
  if (!existsSync(file)) {
    throw new Error(`${file} yo'q — .env.example dan nusxa oling va to'ldiring`);
  }
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [
          line.slice(0, index).trim(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^"|"$/g, ''),
        ];
      }),
  );
}

/** Tizimdagi chromium — Playwright o'z brauzerini yuklab olmasin. */
function chromiumPath() {
  const candidates = [
    process.env.CHROMIUM_BIN,
    '/snap/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean);

  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`Chromium topilmadi. CHROMIUM_BIN=... bilan ko'rsating`);
  return found;
}

async function loadPlaywright() {
  // Playwright — CJS paket: `import()` uni `default` ichiga o'raydi,
  // shuning uchun ikkala shakl ham tekshiriladi
  const unwrap = (module) => module.chromium ?? module.default?.chromium;
  const cached = join(DEPS, 'node_modules/playwright/index.js');

  for (const source of [
    'playwright',
    ...(existsSync(cached) ? [pathToFileURL(cached).href] : []),
  ]) {
    try {
      const found = unwrap(await import(source));
      if (found) return found;
    } catch {
      // keyingi manbaga o'tamiz
    }
  }

  console.log('playwright topilmadi — /tmp ga o‘rnatilmoqda (bir marta)…');
  mkdirSync(DEPS, { recursive: true });
  execFileSync('npm', ['install', '--silent', '--prefix', DEPS, 'playwright'], {
    stdio: 'inherit',
  });

  const local = await import(pathToFileURL(join(DEPS, 'node_modules/playwright/index.js')).href);
  const chromium = unwrap(local);
  if (!chromium) throw new Error('playwright yuklandi, lekin `chromium` eksporti topilmadi');
  return chromium;
}

async function waitForServers() {
  for (const [name, url] of [
    ['API', `${API}/health/live`],
    ['web', `${WEB}/login`],
  ]) {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const alive = await fetch(url).then(
        (response) => response.ok,
        () => false,
      );
      if (alive) break;
      if (Date.now() > deadline) throw new Error(`${name} javob bermadi: ${url}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// ──────────────────────────── Brauzer seansi ────────────────────────────

async function session() {
  const chromium = await loadPlaywright();
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    // Konteynerda user namespace yo'q — sandboxsiz ishga tushadi
    args: ['--no-sandbox'],
  });

  const hasState = existsSync(STATE);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    ...(hasState ? { storageState: STATE } : {}),
  });
  const page = await context.newPage();

  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  /**
   * Har doim `networkidle`: Next dev marshrutni birinchi so'rovda
   * kompilyatsiya qiladi va `domcontentloaded` dan keyin sahifa 30
   * soniyagacha bo'sh turishi mumkin — locator kutishi undan oldin
   * tugab qoladi.
   */
  const open = async (path) => {
    await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle', timeout: 90_000 });
  };

  if (hasState) {
    await open('/dashboard');
    // Sessiya eskirgan bo'lsa ilova `/login` ga qaytaradi
    if (page.url().includes('/login')) await login(page, open, context);
  } else {
    await open('/login');
    await login(page, open, context);
  }

  return { browser, context, page, open, errors };
}

async function login(page, open, context) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = env();
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "apps/api/.env da ADMIN_EMAIL/ADMIN_PASSWORD yo'q — `pnpm db:seed` ni bajaring",
    );
  }

  if (!page.url().includes('/login')) await open('/login');
  await page.locator('#email').waitFor({ timeout: 90_000 });
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await context.storageState({ path: STATE });
}

// ─────────────────────────────── Buyruqlar ───────────────────────────────

const PAGES = [
  ['dashboard', '/dashboard', 'Boshqaruv'],
  ['products', '/products', 'Katalog'],
  ['inventory', '/inventory', 'Ombor'],
  ['customers', '/customers', 'Mijozlar'],
  ['settings', '/settings', 'Sozlamalar'],
  ['settings-catalog', '/settings/catalog', 'Kategoriyalar'],
];

async function smoke() {
  await waitForServers();
  const { browser, page, open, errors } = await session();

  try {
    for (const [name, path, heading] of PAGES) {
      await open(path);
      await page.getByRole('heading', { name: heading }).first().waitFor({ timeout: 60_000 });
      const file = join(SHOTS, `${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`✓ ${path} → ${file}`);
    }
  } finally {
    await browser.close();
  }

  if (errors.length > 0) {
    console.log(`\nconsole xatolari:\n${errors.join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nconsole: xato yo‘q');
}

async function shot(path, name) {
  await waitForServers();
  const { browser, page, open, errors } = await session();

  try {
    await open(path);
    // Ilovadagi hamma sahifa `h1` bilan boshlanadi — chizilganini shu bildiradi
    await page.locator('h1').first().waitFor({ timeout: 60_000 });
    const file = join(SHOTS, `${name ?? path.replace(/\W+/gu, '-').replace(/^-|-$/gu, '')}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  } finally {
    await browser.close();
  }

  if (errors.length > 0) console.log(`console xatolari:\n${errors.join('\n')}`);
}

/**
 * REST chaqiruvi — CSRF va sessiya cookie'si bilan.
 *
 * Mutatsiya `X-CSRF-Token` talab qiladi (`API.md` §1) va cookie'ni
 * server istalgan so'rovda qo'yadi, shuning uchun avval `health/live`
 * chaqiriladi. `PATCH` uchun `expectedUpdatedAt` yoki
 * `If-Unmodified-Since` majburiy (`API.md` §8) — usiz `428` keladi.
 */
async function api(method, path, body) {
  await waitForServers();
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = env();

  // Cookie'lar diskda saqlanadi — har chaqiruvda qayta login qilinsa,
  // 5 urinishdan keyin `429` boshlanardi (`API.md` §6)
  const jar = new Map(existsSync(API_STATE) ? JSON.parse(readFileSync(API_STATE, 'utf8')) : []);

  const remember = (response) => {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
  };

  const call = async (verb, url, payload) => {
    const headers = { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (verb !== 'GET') {
      headers['X-CSRF-Token'] = jar.get('hisobai_csrf') ?? '';
      // Moliyaviy POST'lar uchun majburiy (§17.6); ortiqcha bo'lsa e'tiborsiz qoladi
      headers['Idempotency-Key'] = crypto.randomUUID();
    }

    const response = await fetch(`${API}${url}`, {
      method: verb,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    remember(response);
    return response;
  };

  await call('GET', '/health/live');

  // Saqlangan sessiya hali tirikmi — shu bitta so'rov aytadi
  const alive = jar.has('hisobai_session') && (await call('GET', '/auth/me')).ok;
  if (!alive) {
    const auth = await call('POST', '/auth/login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    if (!auth.ok) {
      console.log(`login ${auth.status}: ${await auth.text()}`);
      process.exitCode = 1;
      return;
    }
  }
  writeFileSync(API_STATE, JSON.stringify([...jar]));

  const response = await call(method.toUpperCase(), path, body);
  const text = await response.text();
  console.log(`${response.status} ${method.toUpperCase()} ${path}`);
  console.log(text.length > 0 ? text : '(bo‘sh javob)');
  if (!response.ok) process.exitCode = 1;
}

// ──────────────────────────────── Kirish ────────────────────────────────

const [command, ...args] = process.argv.slice(2);

const commands = {
  smoke: () => smoke(),
  shot: () => shot(args[0] ?? '/dashboard', args[1]),
  api: () =>
    api(args[0] ?? 'GET', args[1] ?? '/health/ready', args[2] ? JSON.parse(args[2]) : undefined),
};

const run = commands[command ?? 'smoke'];
if (!run) {
  console.log('Buyruqlar: smoke | shot <yo‘l> [nom] | api <METOD> <yo‘l> [json]');
  process.exit(1);
}

await run();
