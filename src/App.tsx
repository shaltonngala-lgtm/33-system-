/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export default function App() {
  const [notification, setNotification] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error';
    id: number;
  } | null>(null);

  const triggerNotification = (title: string, message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setNotification({ title, message, type, id });
    
    // Auto collapse banner in 5s
    setTimeout(() => {
      setNotification(prev => (prev && prev.id === id ? null : prev));
    }, 5000);
  };

  return (
    <div className="relative min-h-screen bg-[#F8F9FA] text-[#1F1F1F] selection:bg-[#E8F0FE] selection:text-[#1A73E8]">
      {/* Simulation Dashboard */}
      <Dashboard onNotification={triggerNotification} />

      {/* Slide-In Notification Toasts */}
      {notification && (
        <div 
          id="toast-notification"
          className="fixed bottom-5 right-5 z-55 max-w-sm w-full bg-white border border-neutral-150/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] animate-slide-in font-sans text-sm"
        >
          <div className="flex-shrink-0 mt-0.5">
            {notification.type === 'success' ? (
              <span className="flex h-2.5 w-2.5 rounded-full bg-[#01875F]" />
            ) : (
              <span className="flex h-2.5 w-2.5 rounded-full bg-[#D93025]" />
            )
            }
          </div>
          
          <div className="flex-grow">
            <h4 className="text-xs font-semibold text-[#1F1F1F] tracking-tight leading-tight">
              {notification.title}
            </h4>
            <p className="text-[11px] text-[#5F6368] mt-1 leading-relaxed">
              {notification.message}
            </p>
          </div>

          <button 
            onClick={() => setNotification(null)}
            className="flex-shrink-0 text-slate-400 hover:text-[#1F1F1F] p-0.5 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
