'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import TourList from '@/components/tours/TourList';
import { useRouter } from 'next/navigation';
import CreateTour from '@/components/tours/CreateTour';
import { Home, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function ToursPage() {
  const [view, setView] = useState<'list' | 'create' >('list');
  const [refreshKey, setRefreshKey] = useState(0);
  const router = useRouter();
  const { logout } = useAuth();

  const handleTourCreated = (tour: any) => {
    console.log('handleTourCreated called with:', tour);
    // Switch back to list view and refresh the list
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Virtual Tours Manager</h1>
            <div className="flex items-center gap-4">
              {/* Navigation Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setView('list')}
                  className={`px-4 py-2 rounded cursor-pointer ${
                    view === 'list' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Tour List
                </button>
                <button
                  onClick={() => setView('create')}
                  className={`px-4 py-2 rounded cursor-pointer ${
                    view === 'create' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Create Tour
                </button>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-2 border-l pl-4">
                <button
                  onClick={handleBackToHome}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors duration-200 cursor-pointer"
                >
                  <Home className="w-4 h-4" />
                  Back to Home
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors duration-200 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'list' && (
          <TourList 
            key={refreshKey}
          />
        )}
        {view === 'create' && (
          <CreateTour
            onSuccess={handleTourCreated}
          />
        )}


      </main>
    </div>
  );
}