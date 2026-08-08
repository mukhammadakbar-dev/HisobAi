import { BASE_CURRENCY, Currency, formatMoneyWithCurrency } from '@hisobai/contracts';

export default function HomePage() {
  return (
    <main>
      <h1>HisobAI CRM</h1>
      <p className="muted">v0.2 — poydevor bosqichi</p>

      <div className="card">
        <strong>Holat:</strong> monorepo skeleti va ma&apos;lumotlar bazasi schema&apos;si tayyor.
        Modullar <code>docs/TZ.md</code> §22 dagi tartibda qo&apos;shiladi.
      </div>

      <div className="card">
        <strong>Keyingi bosqich — Auth va sozlamalar:</strong>
        <ul>
          <li>users/role, sessiya (30 kun), login cheklovi va kirish jurnali</li>
          <li>do&apos;kon sozlamalari va standart qiymatlar</li>
          <li>valyuta kursi: CBU sync va do&apos;kon kursi</li>
        </ul>
      </div>

      <div className="card">
        <strong>Valyuta tekshiruvi</strong>
        <ul>
          <li>
            Bazaviy valyuta: <code>{BASE_CURRENCY}</code>
          </li>
          <li>UZS: {formatMoneyWithCurrency('12500000', Currency.UZS)}</li>
          <li>USD: {formatMoneyWithCurrency('1250.5', Currency.USD)}</li>
        </ul>
        <p className="muted">
          UZS butun songacha, USD ikki kasr xonagacha yaxlitlanadi (DECISIONS §1.10).
        </p>
      </div>
    </main>
  );
}
