'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      setShowBanner(true);
    }
    setIsLoading(false);
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    localStorage.setItem('cookie-consent-date', new Date().toISOString());
    setShowBanner(false);
    
    // Here you can enable analytics/tracking
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('consent', 'update', {
        'ad_storage': 'granted',
        'analytics_storage': 'granted'
      });
    }
  };

  const handleReject = () => {
    localStorage.setItem('cookie-consent', 'rejected');
    localStorage.setItem('cookie-consent-date', new Date().toISOString());
    setShowBanner(false);
    
    // Ensure tracking is disabled
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('consent', 'update', {
        'ad_storage': 'denied',
        'analytics_storage': 'denied'
      });
    }
  };

  const handleCustomize = () => {
    // For now, just show a simple alert - you could create a more detailed modal
    alert('För närvarande kan du välja att acceptera eller avvisa alla cookies. Mer detaljerade inställningar kommer snart.');
  };

  if (isLoading || !showBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-blue-500 shadow-lg z-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              🍪 Vi använder cookies
            </h3>
            <p className="text-gray-700 text-sm md:text-base leading-relaxed">
              Vi använder cookies för att förbättra din upplevelse, analysera trafik och visa relevanta annonser. 
              Genom att fortsätta använda sidan accepterar du vår användning av cookies.{' '}
              <Link href="/privacy-policy" className="text-blue-600 hover:text-blue-800 underline">
                Läs mer i vår integritetspolicy
              </Link>.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 min-w-fit">
            <button
              onClick={handleCustomize}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-200 border border-gray-300"
            >
              Anpassa
            </button>
            <button
              onClick={handleReject}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-200 border border-gray-300"
            >
              Avvisa alla
            </button>
            <button
              onClick={handleAccept}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors duration-200 shadow-sm"
            >
              Acceptera alla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}