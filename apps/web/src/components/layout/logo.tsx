/**
 * HisobAI logotipi — inline SVG (`FRONTEND.md` §15.4).
 *
 * Nega fayl emas, inline: logotipda IKKI rang bor (harflar va "AI"), va
 * ular mavzuga qarab almashishi kerak. `<img>` ichidagi SVG bizning
 * `data-theme` atributimizni ko'ra olmaydi — u faqat operatsion tizim
 * sozlamasini biladi. Natijada foydalanuvchi mavzuni QO'LDA tanlaganda
 * logotip fonga qo'shilib ko'rinmay qolardi (§15.3).
 *
 * Bu yerda `fill` bizning tokenlarimizdan olinadi, shuning uchun uchala
 * holat (SYSTEM / LIGHT / DARK) ham to'g'ri ishlaydi. Qo'shimcha so'rov
 * ham ketmaydi — header birinchi render'da to'liq chiqadi.
 *
 * Konturlar `public/brand/hisobai-logo.svg` bilan aynan bir xil. CSS
 * ishlamaydigan joylarda (shartnoma PDF, favicon, email) o'sha fayllar
 * ishlatiladi.
 */
export function Logo({ className, title = 'HisobAI' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 312.96 79.44" role="img" aria-label={title} className={className} fill="none">
      <title>{title}</title>
      <path
        fill="var(--logo-base)"
        transform="translate(2.48 70.72) scale(0.08 -0.08)"
        d="M648 698V0H508V297H209V0H69V698H209V411H508V698Z"
      />
      <path
        fill="var(--logo-base)"
        transform="translate(59.84 70.72) scale(0.08 -0.08)"
        d="M54 702Q54 737 78.5 760.5Q103 784 140 784Q177 784 201.5 760.5Q226 737 226 702Q226 667 201.5 643.5Q177 620 140 620Q103 620 78.5 643.5Q54 667 54 702ZM209 554V0H69V554Z"
      />
      <path
        fill="var(--logo-base)"
        transform="translate(82.08 70.72) scale(0.08 -0.08)"
        d="M39 175H180Q184 143 211.5 122.0Q239 101 280 101Q320 101 342.5 117.0Q365 133 365 158Q365 185 337.5 198.5Q310 212 250 228Q188 243 148.5 259.0Q109 275 80.5 308.0Q52 341 52 397Q52 443 78.5 481.0Q105 519 154.5 541.0Q204 563 271 563Q370 563 429.0 513.5Q488 464 494 380H360Q357 413 332.5 432.5Q308 452 267 452Q229 452 208.5 438.0Q188 424 188 399Q188 371 216.0 356.5Q244 342 303 327Q363 312 402.0 296.0Q441 280 469.5 246.5Q498 213 499 158Q499 110 472.5 72.0Q446 34 396.5 12.5Q347 -9 281 -9Q213 -9 159.0 15.5Q105 40 73.5 82.0Q42 124 39 175Z"
      />
      <path
        fill="var(--logo-base)"
        transform="translate(125.68 70.72) scale(0.08 -0.08)"
        d="M34 277Q34 362 71.5 427.0Q109 492 174.0 527.5Q239 563 319 563Q399 563 464.0 527.5Q529 492 566.5 427.0Q604 362 604 277Q604 192 565.5 127.0Q527 62 461.5 26.5Q396 -9 315 -9Q235 -9 171.0 26.5Q107 62 70.5 127.0Q34 192 34 277ZM460 277Q460 356 418.5 398.5Q377 441 317 441Q257 441 216.5 398.5Q176 356 176 277Q176 198 215.5 155.5Q255 113 315 113Q353 113 386.5 131.5Q420 150 440.0 187.0Q460 224 460 277Z"
      />
      <path
        fill="var(--logo-base)"
        transform="translate(176.72 70.72) scale(0.08 -0.08)"
        d="M392 563Q463 563 520.5 528.0Q578 493 611.5 428.5Q645 364 645 279Q645 194 611.5 128.5Q578 63 520.5 27.0Q463 -9 392 -9Q330 -9 283.5 15.5Q237 40 209 79V0H69V740H209V473Q236 513 283.5 538.0Q331 563 392 563ZM355 440Q317 440 283.5 420.5Q250 401 229.5 364.0Q209 327 209 277Q209 227 229.5 190.0Q250 153 283.5 133.5Q317 114 355 114Q394 114 427.5 134.0Q461 154 481.5 191.0Q502 228 502 279Q502 329 481.5 365.5Q461 402 427.5 421.0Q394 440 355 440Z"
      />
      <path
        fill="var(--logo-accent)"
        transform="translate(230.96 70.72) scale(0.08 -0.08)"
        d="M497 133H219L173 0H26L277 699H440L691 0H543ZM459 245 358 537 257 245Z"
      />
      <path
        fill="var(--logo-accent)"
        transform="translate(288.24 70.72) scale(0.08 -0.08)"
        d="M209 698V0H69V698Z"
      />
    </svg>
  );
}
