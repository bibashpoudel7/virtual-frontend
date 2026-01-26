'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import PhoneInput from 'react-phone-number-input';
import { parsePhoneNumber } from 'react-phone-number-input';
import { toast } from 'react-toastify';
import axios from 'axios';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { Mail, Phone, MapPin, Send } from 'lucide-react';

import 'react-phone-number-input/style.css';

interface ContactFormData {
  fullName: string;
  email: string;
  message: string;
}

const ContactPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [countryCode, setCountryCode] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [showPhoneError, setShowPhoneError] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<ContactFormData>();

  const checkPhoneNumber = (value: string | undefined) => {
    if (value) {
      const phones = parsePhoneNumber(value);
      if (phones) {
        setPhone(phones.nationalNumber);
        setCountryCode(`+${phones.countryCallingCode}`);
      }
    }
  };

  const onSubmit = async (data: ContactFormData) => {
    if (!phoneNumber) {
      setShowPhoneError(true);
      toast.error('Phone number is required');
      return;
    }

    setShowPhoneError(false);
    setIsLoading(true);

    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5555'}/api/contact`, {
        full_name: data.fullName,
        email: data.email,
        country_code: countryCode,
        phone_number: phone,
        message: data.message,
      });

      if (response.status === 201) {
        toast.success('Your message has been sent successfully!');
        reset();
        setPhoneNumber('');
        setCountryCode('');
        setPhone('');
        setShowPhoneError(false);
      }
    } catch (error: any) {
      console.error('Contact form error:', error);
      toast.error(error.response?.data?.error || 'Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Header Section */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Contact Us</h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Have questions about our virtual tours? We'd love to hear from you.
              Send us a message and we'll respond as soon as possible.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Information */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Get in Touch</h2>

              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <Mail className="w-6 h-6 text-indigo-600 mt-1" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Email</h3>
                    <a
                      href="mailto:info@thenimto.com"
                      className="text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      info@thenimto.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <Phone className="w-6 h-6 text-indigo-600 mt-1" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Phone</h3>
                    <a
                      href="tel:+9779802364691"
                      className="text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      +977-9802364691
                    </a>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <MapPin className="w-6 h-6 text-indigo-600 mt-1" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Office</h3>
                    <p className="text-gray-600">
                      Baluwatar Kathmandu, Nepal
                    </p>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="mt-8 pt-8 border-t border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Why Choose Virtual Tours?</h3>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full mr-3"></div>
                    360° immersive experiences
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full mr-3"></div>
                    Easy-to-use tour creation tools
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full mr-3"></div>
                    Professional quality output
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full mr-3"></div>
                    24/7 customer support
                  </li>
                </ul>
              </div>
            </div>

            {/* Contact Form */}
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Send us a Message</h2>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Full Name */}
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    id="fullName"
                    {...register('fullName', { required: 'Full name is required' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-gray-900 placeholder-gray-500"
                    placeholder="Enter your full name"
                  />
                  {errors.fullName && (
                    <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    {...register('email', {
                      required: 'Email is required',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Invalid email address'
                      }
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white text-gray-900 placeholder-gray-500"
                    placeholder="Enter your email address"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>

                {/* Phone Number */}
                <div>
                  <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number <span className="text-red-600">*</span>
                  </label>
                  <PhoneInput
                    value={phoneNumber}
                    onChange={(value) => {
                      setPhoneNumber(value || '');
                      checkPhoneNumber(value);
                      if (value) {
                        setShowPhoneError(false);
                      }
                    }}
                    defaultCountry="NP"
                    placeholder="Enter phone number"
                    className="w-full phone-input-custom"
                    international={false}
                    countryCallingCodeEditable={false}
                  />
                  {showPhoneError && (
                    <p className="mt-1 text-sm text-red-600">Phone number is required</p>
                  )}
                </div>

                {/* Message */}
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                    Message <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    id="message"
                    rows={6}
                    {...register('message', { required: 'Message is required' })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-none bg-white text-gray-900 placeholder-gray-500"
                    placeholder="Tell us about your project or ask us a question..."
                  />
                  {errors.message && (
                    <p className="mt-1 text-sm text-red-600">{errors.message.message}</p>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default ContactPage;