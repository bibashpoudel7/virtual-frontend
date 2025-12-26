'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Tour {
  id: string;
  name: string;
  property_id: string;
}

export default function PublicTourViewer() {
  const params = useParams();
  const router = useRouter();
  const [tour, setTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const propertyId = params.propertyId as string;

  useEffect(() => {
    if (!propertyId) {
      setError('Property ID is required');
      setLoading(false);
      return;
    }

    fetchTourForProperty();
  }, [propertyId]);

  const fetchTourForProperty = async () => {
    try {
      setLoading(true);
      
      // Call the public API endpoint to get tour for property
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}properties/${propertyId}/tour`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('No virtual tour found for this property');
        } else {
          setError('Failed to load virtual tour');
        }
        setLoading(false);
        return;
      }

      const data = await response.json();
      
      if (data.hasVirtualTour && data.tour) {
        setTour(data.tour);
        // Redirect to the tour viewer with the tour ID
        router.push(`/tours/${data.tour.id}`);
      } else {
        setError('No virtual tour available for this property');
      }
    } catch (error) {
      console.error('Error fetching tour:', error);
      setError('Failed to load virtual tour. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto mb-4"></div>
          <h2 className="text-2xl font-semibold text-white mb-2">Loading Virtual Tour...</h2>
          <p className="text-purple-100">Please wait while we prepare your immersive experience</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-600">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8">
            <div className="text-6xl mb-4">🏠</div>
            <h2 className="text-2xl font-semibold text-white mb-4">Virtual Tour Not Available</h2>
            <p className="text-purple-100 mb-6">{error}</p>
            <button
              onClick={() => window.close()}
              className="bg-white/20 hover:bg-white/30 text-white px-6 py-2 rounded-lg transition-colors duration-200 cursor-pointer"
            >
              Close Window
            </button>
          </div>
        </div>
      </div>
    );
  }

  // This shouldn't be reached as we redirect to /tours/[id] when tour is found
  return null;
}