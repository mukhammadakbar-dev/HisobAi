'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { ProductForm } from '../../../../features/catalog/components/product-form';

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/products"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Katalog
        </Link>
        <h1 className="m-0 text-2xl font-semibold">Yangi mahsulot</h1>
        <p className="m-0 text-text-secondary">
          Shablon yaratiladi. Tannarx va IMEI keyin — qabul qilishda kiritiladi (§4.1).
        </p>
      </header>

      <ProductForm />
    </div>
  );
}
