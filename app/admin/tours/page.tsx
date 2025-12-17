'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import TourList from '@/components/tours/TourList';
import { useRouter } from 'next/navigation';
import CreateTour from '@/components/tours/CreateTour';

export default function ToursPage() {
  const [view, setView] = useState<'list' | 'create' >('list');
  const router = useRouter();

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
            <div className="flex gap-2">
              <button
                onClick={() => setView('list')}
                className={`px-4 py-2 rounded ${
                  view === 'list' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Tour List
              </button>
              <button
                onClick={() => setView('create')}
                className={`px-4 py-2 rounded ${
                  view === 'create' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Create Tour
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'list' && (
          <TourList 
          />
        )}
        {view === 'create' && (
          <CreateTour
          
          />
        )}


      </main>
    </div>
  );
}