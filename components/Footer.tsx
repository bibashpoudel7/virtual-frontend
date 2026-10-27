'use client';

import React from 'react';
import Link from 'next/link';
import { Facebook, Twitter, Instagram, Linkedin, Mail, Phone, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const { isAuthenticated } = useAuth();

  return (
    <footer className="bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-indigo-400">VirtualTours</h3>
            <p className="text-gray-300 text-sm">
              Create stunning 360° virtual tours with our easy-to-use platform. 
              Perfect for real estate, hospitality, and showcase experiences.
            </p>
            <div className="flex space-x-4">
              <a 
                href="https://www.facebook.com/thenimto" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-indigo-400 transition-colors"
              >
                <Facebook className="w-5 h-5" />
              </a>
              <a 
                href="https://x.com/TheNimto" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-indigo-400 transition-colors"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a 
                href="https://www.instagram.com/thenimto/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-indigo-400 transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a 
                href="https://www.linkedin.com/company/thenimto/posts/?feedView=all" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-indigo-400 transition-colors"
              >
                <Linkedin className="w-5 h-5" />
              </a>
              <a 
                href="https://www.tiktok.com/@thenimto?lang=en" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-indigo-400 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-gray-300 hover:text-indigo-400 transition-colors text-sm">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/showcase" className="text-gray-300 hover:text-indigo-400 transition-colors text-sm">
                  Browse Tours
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-gray-300 hover:text-indigo-400 transition-colors text-sm">
                  Contact
                </Link>
              </li>
              {/* Only show Sign In link when user is not authenticated */}
              {!isAuthenticated && (
                <li>
                  <Link href="/login" className="text-gray-300 hover:text-indigo-400 transition-colors text-sm">
                    Sign In
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {/* Services */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold">Services</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/showcase" className="text-gray-300 hover:text-indigo-400 transition-colors text-sm">
                  360° Photography
                </Link>
              </li>
              <li>
                <Link href="/showcase" className="text-gray-300 hover:text-indigo-400 transition-colors text-sm">
                  Virtual Tour Creation
                </Link>
              </li>
              <li>
                <Link href="/showcase" className="text-gray-300 hover:text-indigo-400 transition-colors text-sm">
                  Real Estate Tours
                </Link>
              </li>
              <li>
                <Link href="/showcase" className="text-gray-300 hover:text-indigo-400 transition-colors text-sm">
                  Custom Solutions
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold">Contact Info</h4>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Mail className="w-4 h-4 text-indigo-400" />
                <a 
                  href="mailto:info@thenimto.com" 
                  className="text-gray-300 hover:text-indigo-400 transition-colors text-sm"
                >
                  info@thenimto.com
                </a>
              </div>
              <div className="flex items-center space-x-3">
                <Phone className="w-4 h-4 text-indigo-400" />
                <a 
                  href="tel:+9779802364691" 
                  className="text-gray-300 hover:text-indigo-400 transition-colors text-sm"
                >
                  +977-9802364691
                </a>
              </div>
              <div className="flex items-start space-x-3">
                <MapPin className="w-4 h-4 text-indigo-400 mt-0.5" />
                <a 
                  href="https://maps.app.goo.gl/m45GDqJMaJZL32sA8" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-indigo-400 transition-colors text-sm"
                >
                  Baluwatar Kathmandu, Nepal
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 mt-8 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-gray-400 text-sm">
              © {currentYear} VirtualTours. All rights reserved.
            </p>
            {/* <div className="flex space-x-6">
              <Link href="/privacy" className="text-gray-400 hover:text-indigo-400 transition-colors text-sm">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-gray-400 hover:text-indigo-400 transition-colors text-sm">
                Terms of Service
              </Link>
            </div> */}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;