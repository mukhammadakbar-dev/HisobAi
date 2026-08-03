import Link from 'next/link';
import { Montserrat } from 'next/font/google';
import styles from './Logo.module.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['900'],
  display: 'swap',
});

export function LogoMark() {
  return (
    <span className={`${styles.logo} ${montserrat.className}`}>
      <span className={styles.hisob}>Hisob</span>
      <span className={styles.ai}>AI</span>
    </span>
  );
}

export default function Logo() {
  return (
    <Link href="/" aria-label="HisobAI bosh sahifasi" className={styles['logo-link']}>
      <LogoMark />
    </Link>
  );
}
