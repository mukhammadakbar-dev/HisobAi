import { redirect } from 'next/navigation';

/**
 * Ildiz manzilining o'z mazmuni yo'q — u boshqaruvga yo'naltiradi.
 *
 * Sessiya bu yerda tekshirilmaydi: cookie `HttpOnly` va uni server
 * komponenti API'ga so'rov yubormasdan baholay olmaydi. Tekshiruv
 * `(app)/layout.tsx` da — sessiyasiz foydalanuvchi o'sha yerdan
 * `/login` ga tushadi. Bir joyda bitta darvoza.
 *
 * (1-bosqichdagi poydevor namoyish sahifasi shu bilan almashtirildi —
 * o'sha faylning izohida ham shunday rejalashtirilgan edi.)
 */
export default function RootPage() {
  redirect('/dashboard');
}
