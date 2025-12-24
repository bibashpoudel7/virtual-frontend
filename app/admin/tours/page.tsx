'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import TourList from '@/components/tours/TourList';
import { useRouter } from 'next/navigation';
import CreateTour from '@/components/tours/CreateTour';
import { Home, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Property } from '@/types/tour';
import { tourService } from '@/services/tourService';

interface CompanyInfo {
  id: string;
  companyName: string;
  companyPurpose: string;
  isVenueCompany: boolean;
}

export default function ToursPage() {
  const [view, setView] = useState<'list' | 'create' >('list');
  const [refreshKey, setRefreshKey] = useState(0);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isVenueCompany, setIsVenueCompany] = useState<boolean>(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [dataLoaded, setDataLoaded] = useState<boolean>(false);
  const router = useRouter();
  const { logout } = useAuth();

  const handleTourCreated = (tour: any) => {
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

  // Preload user data and company info when page loads
  useEffect(() => {
    const preloadData = async () => {
      try {
        // Get user role from localStorage
        const userData = localStorage.getItem('user_data');
        let role = null;
        if (userData) {
          try {
            const user = JSON.parse(userData);
            role = user.roles?.toString() || user.role?.toString() || null;
            setUserRole(role);
          } catch (error) {
            console.error('Error parsing user data:', error);
          }
        }

        // If user is a vendor, check company info and load properties
        if (role === '3') {
          try {
            // Check if user is a venue company
            const companyInfo: CompanyInfo = await tourService.getCompanyInfo();
            setIsVenueCompany(companyInfo.isVenueCompany || false);

            // If venue company, preload properties
            if (companyInfo.isVenueCompany) {
              const response = await tourService.getApprovedProperties();
              setProperties(response.properties);
            }
          } catch (error) {
            console.error('Error loading company info or properties:', error);
            setIsVenueCompany(false);
            setProperties([]);
          }
        } else if (role === '1') {
          // Superadmin - load all properties
          try {
            const response = await tourService.getApprovedProperties();
            setProperties(response.properties);
          } catch (error) {
            console.error('Error loading properties for superadmin:', error);
            setProperties([]);
          }
        }
      } catch (error) {
        console.error('Error preloading data:', error);
      } finally {
        setDataLoaded(true);
      }
    };

    preloadData();
  }, []);


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
            preloadedData={{
              userRole,
              isVenueCompany,
              properties,
              dataLoaded
            }}
          />
        )}


      </main>
    </div>
  );
}