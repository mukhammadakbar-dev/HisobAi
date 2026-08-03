'use client';

import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import {
  Settings,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  ShieldCheck,
  Send,
  RefreshCw,
  Key,
} from 'lucide-react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function SettingsPage() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [vapidKey, setVapidKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
    fetchVapidKey();
    checkExistingSubscription();
  }, []);

  const fetchVapidKey = async () => {
    try {
      const res = await apiRequest<{ publicKey: string }>('/push-subscriptions/vapid-public-key');
      setVapidKey(res.publicKey);
    } catch (err: any) {
      console.error('Failed to fetch VAPID key:', err);
    }
  };

  const checkExistingSubscription = async () => {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const sub = await registration.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      }
    }
  };

  const handleEnablePush = async () => {
    setIsLoading(true);
    setStatusMsg(null);
    setErrorMsg(null);

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Brauzeringiz Web Push bildirishnomalarini qo\'llab-quvvatlamaydi');
      }

      // 1. Request permission
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== 'granted') {
        throw new Error('Bildirishnomalarga ruxsat berilmadi');
      }

      // 2. Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // 3. Get VAPID public key
      let keyToUse = vapidKey;
      if (!keyToUse) {
        const res = await apiRequest<{ publicKey: string }>('/push-subscriptions/vapid-public-key');
        keyToUse = res.publicKey;
        setVapidKey(keyToUse);
      }

      // 4. Subscribe to PushManager
      const applicationServerKey = urlBase64ToUint8Array(keyToUse);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const subJson = subscription.toJSON();
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        throw new Error('Push obuna kalitlarini shakllantirishda xatolik');
      }

      // 5. Send subscription to API
      await apiRequest('/push-subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        }),
      });

      setIsSubscribed(true);
      setStatusMsg('Web Push bildirishnomalari muvaffaqiyatli yoqildi va serverga saqlandi! 🎉');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Bildirishnomalarni yoqishda xatolik yuz berdi');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerReminders = async () => {
    setIsLoading(true);
    setStatusMsg(null);
    setErrorMsg(null);

    try {
      const res = await apiRequest<{ message: string }>('/notifications/trigger-reminders', {
        method: 'POST',
      });
      setStatusMsg(res.message || 'To\'lov eslatmalari yuborildi!');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Eslatmalarni yuborishda xatolik');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-7 h-7 text-emerald-400" />
            Tizim Sozlamalari
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            PWA mobil ilova sozlamalari, Web Push bildirishnomalari va SMS xabarnoma kanallari
          </p>
        </div>
      </div>

      {statusMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Web Push & PWA Notifications Card */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base">Web Push Bildirishnomalari (PWA)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Ertangi kun uchun muddati kelgan nasiya to'lovlari haqida brauzer va telefonga avtomatik bildirishnoma yuborish
              </p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
              isSubscribed
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
            }`}
          >
            {isSubscribed ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" /> Faol
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5" /> Yoqilmagan
              </>
            )}
          </span>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex justify-between items-center">
            <span className="text-slate-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Ruxsat Holati:
            </span>
            <span className="font-bold text-slate-200 uppercase">{permission}</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex justify-between items-center">
            <span className="text-slate-400 flex items-center gap-2">
              <Key className="w-4 h-4 text-sky-400" /> VAPID Public Key:
            </span>
            <span className="font-mono text-[11px] text-slate-300 truncate max-w-[150px]">
              {vapidKey ? `${vapidKey.substring(0, 12)}...` : 'Yuklanmoqda'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={handleEnablePush}
            disabled={isLoading}
            className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            <span>Bildirishnomalarni Yoqish va Obuna Bo'lish</span>
          </button>

          <button
            onClick={handleTriggerReminders}
            disabled={isLoading}
            className="px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4 text-emerald-400" />
            <span>To'lov Eslatmalarini Qayta Ishlash (Test Trigger)</span>
          </button>
        </div>
      </div>

      {/* SMS Provider Architecture Card */}
      <div className="p-6 rounded-3xl glass-panel border border-slate-800 space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-base">SMS Provayder Integratsiyasi (Architecture Section 10)</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Hozirda abstrakt `SMS_PROVIDER` porti orqali `ConsoleSmsProvider` faol (xabarlar konsolga yoziladi)
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-2">
          <p className="font-semibold text-emerald-400">✅ SMS Provayder Port & Adapter Strukturasi:</p>
          <p className="text-slate-400 text-[11px]">
            Haqiqiy SMS provayder (Eskiz.uz yoki PlaySMS) ulanganda biznes mantiqini o'zgartirmasdan faqat `ConsoleSmsProvider` o'rniga yangi klass ulash kifoya.
          </p>
        </div>
      </div>
    </div>
  );
}
