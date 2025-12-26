'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Tour } from '@/types/tour';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function ShowcasePage() {
  const router = useRouter();
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchPublicTours();
  }, []);

  const fetchPublicTours = async () => {
    try {
      setLoading(true);
      // Fetch directly from backend - backend will handle is_published logic
      const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5555/api/';
      const response = await fetch(`${backendUrl}tours/public`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tours');
      }

      const data = await response.json();
      setTours(data);
    } catch (err) {
      console.error('Failed to fetch tours:', err);
      setError('Unable to load virtual tours. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const filteredTours = tours.filter(tour => {
    const matchesSearch = 
      tour.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tour.property_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Function to get gradient colors based on tour type or name
  const getTourGradient = (tour: Tour, index: number) => {
    // Use different gradients based on tour characteristics
    if (tour.property_name) {
      // Property tours - use warmer colors
      const propertyGradients = [
        'from-emerald-400 to-emerald-600',
        'from-teal-400 to-teal-600', 
        'from-cyan-400 to-cyan-600',
        'from-sky-400 to-sky-600'
      ];
      return propertyGradients[index % propertyGradients.length];
    } else {
      // Standalone tours - use cooler colors
      const standaloneGradients = [
        'from-purple-400 to-purple-600',
        'from-indigo-400 to-indigo-600',
        'from-violet-400 to-violet-600',
        'from-pink-400 to-pink-600'
      ];
      return standaloneGradients[index % standaloneGradients.length];
    }
  };

  const handleViewTour = (tourId: string) => {
    router.push(`/tours/${tourId}`);
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Virtual Tour Showcase</h1>
            <p className="text-xl text-gray-600">Explore stunning properties in immersive 360° views</p>
          </div>
          
          <div className="mb-8 flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search tours by name or property..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-gray-900 placeholder-gray-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 text-lg mb-4">{error}</p>
            <button
              onClick={fetchPublicTours}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : filteredTours.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">
              {searchTerm ? 'No virtual tours found matching your search.' : 'No virtual tours available at the moment.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTours.map((tour, index) => (
              <div
                key={tour.id}
                className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-shadow duration-300 cursor-pointer group"
                onClick={() => handleViewTour(tour.id)}
              >
                <div className={`relative h-48 overflow-hidden bg-gradient-to-br ${getTourGradient(tour, index)}`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <svg className="w-16 h-16 text-white/40 mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-8c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2z"/>
                      </svg>
                      <p className="text-white/60 text-xs font-medium">360° Experience</p>
                    </div>
                  </div>
                  
                  {/* Tour type badge */}
                  <div className="absolute top-4 left-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      tour.property_name 
                        ? 'bg-green-500/20 text-green-100 border border-green-400/30' 
                        : 'bg-purple-500/20 text-purple-100 border border-purple-400/30'
                    }`}>
                      {tour.property_name ? 'Property Tour' : 'Standalone Tour'}
                    </span>
                  </div>
                  
                  {/* Scene count badge */}
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full">
                    <span className="text-sm font-semibold text-gray-800">
                      {tour.tour_scenes?.length || 0} scenes
                    </span>
                  </div>
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="text-white text-center">
                      <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm font-medium">Click to explore</p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors flex-1">
                      {tour.name}
                    </h3>
                    {tour.source === 'standalone' && (
                      <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                        Independent
                      </span>
                    )}
                  </div>
                  
                  {tour.property_name && (
                    <div className="mb-3">
                      <p className="text-gray-600 text-sm flex items-center">
                        <svg className="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {tour.property_name}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                    <div className="flex items-center text-sm text-gray-500">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>360° Virtual Tour</span>
                    </div>
                    <button
                      className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm flex items-center group-hover:gap-2 transition-all cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewTour(tour.id);
                      }}
                    >
                      Explore
                      <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      <Footer />
    </div>
  );
}