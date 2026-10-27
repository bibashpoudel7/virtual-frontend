'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../utils/api';
import { Tour, ApiError } from '@/types/api';

export default function Home() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchTours();
  }, [router]);

  const fetchTours = async () => {
    try {
      const data = await apiClient.get<Tour[]>('/tours');
      setTours(data);
    } catch (err) {
      const error = err as ApiError;
      console.error('Failed to fetch tours:', error);
      // If unauthorized, redirect to login
      if (error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const createTour = async () => {
    try {
      const newTour = await apiClient.post<Tour>('/tours', { name });
      router.push(`/tour/${newTour.id}`);
    } catch (err) {
      const error = err as ApiError;
      console.error('Failed to create tour:', error);
      // Handle error (you might want to show a toast or error message)
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-600">Loading tours...</p>
      </div>
    );
  }

  return (
    <div className="p-5 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Virtual Tours</h1>
        <button 
          onClick={handleLogout}
          className="px-4 py-2 bg-gray-50 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
        >
          Logout
        </button>
      </div>

      <div className="flex gap-2.5 mb-5">
        <input 
          type="text"
          placeholder="New Tour Name" 
          value={name} 
          onChange={(e) => setName(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button 
          onClick={createTour}
          disabled={!name.trim()}
          className={`px-4 py-2 text-white rounded transition-colors cursor-pointer ${
            !name.trim() 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          Create Tour
        </button>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {tours.length === 0 ? (
          <div className="text-center py-10 px-5 text-gray-500">
            No tours found. Create your first tour above.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {tours.map((t) => (
              <li key={t.id} className="px-5 py-4 flex justify-between items-center hover:bg-gray-50">
                <span className="text-gray-900">{t.name}</span>
                <a 
                  href={`/tour/${t.id}`}
                  className="text-sm text-blue-500 hover:text-blue-600 px-2 py-1 border border-blue-500 rounded hover:bg-blue-50 transition-colors"
                >
                  Edit
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
