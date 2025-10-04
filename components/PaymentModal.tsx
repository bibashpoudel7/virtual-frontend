'use client';

import React, { useState } from 'react';
import { X, CreditCard, Check } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tourId: string;
  onSuccess: () => void;
}

export default function PaymentModal({ isOpen, onClose, tourId, onSuccess }: PaymentModalProps) {
  const { getAuthHeaders } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'single' | 'subscription'>('single');

  const plans = {
    single: {
      name: 'Single Tour',
      price: 29.99,
      description: 'Create one virtual tour',
      features: [
        'Up to 10 scenes',
        'Unlimited hotspots',
        'Basic analytics',
        '30-day hosting'
      ]
    },
    subscription: {
      name: 'Monthly Unlimited',
      price: 99.99,
      description: 'Unlimited tours per month',
      features: [
        'Unlimited tours',
        'Up to 50 scenes per tour',
        'Advanced analytics',
        'Priority support',
        'Custom branding',
        'API access'
      ]
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Choose Your Plan</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {Object.entries(plans).map(([key, plan]) => (
            <div
              key={key}
              onClick={() => setSelectedPlan(key as 'single' | 'subscription')}
              className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
                selectedPlan === key
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-gray-600 text-sm">{plan.description}</p>
                </div>
                {selectedPlan === key && (
                  <div className="bg-blue-500 text-white rounded-full p-1">
                    <Check size={16} />
                  </div>
                )}
              </div>
              
              <div className="mb-4">
                <span className="text-3xl font-bold">${plan.price}</span>
                {key === 'subscription' && (
                  <span className="text-gray-500 text-sm">/month</span>
                )}
              </div>
              
              <ul className="space-y-2">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check size={16} className="text-green-500 mt-0.5" />
                    <span className="text-sm text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* <div className="border-t pt-6">
          <button
            onClick={handlePayment}
            disabled={loading}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Processing...
              </>
            ) : (
              <>
                <CreditCard size={20} />
                Continue to Payment
              </>
            )}
          </button>
          
          <p className="text-center text-xs text-gray-500 mt-4">
            Secure payment powered by Stripe. Your payment information is never stored on our servers.
          </p>
        </div> */}
      </div>
    </div>
  );
}