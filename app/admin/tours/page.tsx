'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import TourList from '@/components/tours/TourList';
import { useRouter } from 'next/navigation';
import CreateTour from '@/components/tours/CreateTour';
import { Home, List, LogOut, Plus, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Tour } from '@/types/tour';

export default function ToursPage() {
  const [view, setView] = useState<'list' | 'create' >('list');
  const [refreshKey, setRefreshKey] = useState(0);
  const router = useRouter();
  const { logout, isAdmin, user } = useAuth();

  const handleTourCreated = (tour: Tour) => {
    // Go straight to the new tour so the user can upload 360° photos
    if (tour?.id) {
      router.push(`/admin/tours/${tour.id}?tab=scenes`);
      return;
    }
    setView('list');
    setRefreshKey(prev => prev + 1);
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleBackToHome = () => {
    router.push('/');
  };

  useEffect(() => {
    // Check if user is authenticated (NestJS uses accessToken)
    const token = localStorage.getItem('accessToken') || localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
      return;
    }
    
    // Set axios default header
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">Virtual Tours Manager</h1>
              {user && (
                <p className="text-xs text-gray-500 truncate">
                  {user.email}{isAdmin ? ' · Admin' : ''}
                </p>
              )}
            </div>

            {/* Account actions: icon-only on phones */}
            <div className="flex items-center gap-2 sm:order-last">
              <button
                onClick={handleBackToHome}
                aria-label="Back to Home"
                title="Back to Home"
                className="flex items-center gap-2 p-2 sm:px-4 sm:py-2 bg-gray-600 text-sm font-medium text-white rounded-lg hover:bg-gray-700 transition-colors duration-200 cursor-pointer whitespace-nowrap"
              >
                <Home className="w-4 h-4" />
                <span className="hidden md:inline">Back to Home</span>
              </button>
              <button
                onClick={handleLogout}
                aria-label="Sign Out"
                title="Sign Out"
                className="flex items-center gap-2 p-2 sm:px-4 sm:py-2 bg-red-600 text-sm font-medium text-white rounded-lg hover:bg-red-700 transition-colors duration-200 cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">Sign Out</span>
              </button>
            </div>

            {/* View switcher: full width on phones */}
            <nav className="flex w-full sm:w-auto sm:ml-auto gap-1 p-1 bg-gray-100 rounded-lg">
              {[
                { key: 'list' as const, label: 'My Tours', icon: List },
                { key: 'create' as const, label: 'Create Tour', icon: Plus },
              ].map(({ key, label, icon: NavIcon }) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  aria-current={view === key ? 'page' : undefined}
                  className={`flex flex-1 sm:flex-none items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium cursor-pointer whitespace-nowrap transition-colors ${
                    view === key
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-gray-700 hover:bg-white'
                  }`}
                >
                  <NavIcon className="w-4 h-4" />
                  {label}
                </button>
              ))}
              {/* Contact form submissions: admins only */}
              {isAdmin && (
                <button
                  onClick={() => router.push('/admin/contacts')}
                  className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium cursor-pointer whitespace-nowrap text-gray-700 hover:bg-white transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Contacts
                </button>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {view === 'list' && (
          <TourList 
            key={refreshKey}
          />
        )}
        {view === 'create' && (
          <CreateTour onSuccess={handleTourCreated} />
        )}


      </main>
    </div>
  );
}