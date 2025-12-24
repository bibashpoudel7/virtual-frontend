'use client';

import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Pricing from '../components/Pricing';
import HomeTourViewer from '../components/HomeTourViewer';
import { 
  Play, 
  Globe, 
  Smartphone, 
  Camera, 
  Users, 
  Shield, 
  ArrowRight,
  CheckCircle,
  Star,
  Zap,
  Award,
  BarChart3
} from 'lucide-react';

const HomePage = () => {
  const features = [
    {
      icon: Camera,
      title: '360° Immersive Views',
      description: 'Experience destinations with full panoramic views that put you right in the scene.',
    },
    {
      icon: Smartphone,
      title: 'Mobile Optimized',
      description: 'Access tours from any device with our responsive design and mobile apps.',
    },
    {
      icon: Users,
      title: 'Group Tours',
      description: 'Share experiences with friends and family through synchronized group tours.',
    },
    {
      icon: Shield,
      title: 'Secure & Private',
      description: 'Your data and tours are protected with enterprise-level security.',
    },
    {
      icon: Zap,
      title: 'Lightning Fast',
      description: 'Optimized performance ensures smooth, buffer-free virtual experiences.',
    },
    {
      icon: Globe,
      title: 'Global Reach',
      description: 'Explore locations worldwide from the comfort of your home.',
    },
  ];

  const stats = [
    { number: '10M+', label: 'Virtual Tours Taken' },
    { number: '150+', label: 'Countries Available' },
    { number: '98%', label: 'Customer Satisfaction' },
    { number: '24/7', label: 'Support Available' },
  ];

  const testimonials = [
    {
      name: 'Sarah Johnson',
      role: 'Real Estate Agent',
      content: 'VirtualTours has transformed how I show properties to clients. The quality is incredible!',
      rating: 5,
      image: 'https://i.pravatar.cc/150?img=1',
    },
    {
      name: 'Michael Chen',
      role: 'Travel Blogger',
      content: 'I can scout locations and share experiences with my audience like never before.',
      rating: 5,
      image: 'https://i.pravatar.cc/150?img=2',
    },
    {
      name: 'Emily Rodriguez',
      role: 'Event Planner',
      content: 'Perfect for showcasing venues to clients who cannot visit in person.',
      rating: 5,
      image: 'https://i.pravatar.cc/150?img=3',
    },
  ];

  const useCases = [
    {
      title: 'Real Estate',
      description: 'Showcase properties to potential buyers anywhere in the world',
      icon: '🏠',
    },
    {
      title: 'Tourism',
      description: 'Let travelers explore destinations before booking their trips',
      icon: '✈️',
    },
    {
      title: 'Education',
      description: 'Take students on virtual field trips to enhance learning',
      icon: '🎓',
    },
    {
      title: 'Events',
      description: 'Host virtual events and conferences with immersive experiences',
      icon: '🎪',
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      <section className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-white">
        <div className="absolute inset-0 bg-black opacity-20"></div>
        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                Explore the World Through
                <span className="text-yellow-300"> Virtual Tours</span>
              </h1>
              <p className="text-xl mb-8 text-gray-100">
                Experience immersive 360° tours from anywhere. Perfect for real estate, 
                tourism, education, and events. Start your journey today!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <button className="bg-white text-indigo-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors duration-200 flex items-center justify-center gap-2">
                  <Play className="w-5 h-5" />
                  Start Free Trial
                </button>
                <button className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-indigo-600 transition-all duration-200 flex items-center justify-center gap-2">
                  Watch Demo
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <img
                      key={i}
                      src={`https://i.pravatar.cc/40?img=${i}`}
                      alt={`User ${i}`}
                      className="w-10 h-10 rounded-full border-2 border-white"
                    />
                  ))}
                </div>
                <div>
                  <div className="flex text-yellow-300 mb-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-current" />
                    ))}
                  </div>
                  <p className="text-sm text-gray-100">Trusted by 50,000+ users</p>
                </div>
              </div>
            </div>
            <div className="relative">
              <HomeTourViewer className="aspect-video shadow-2xl" />
              {/* Only show outside badge when user is logged in */}
              {typeof window !== 'undefined' && (localStorage.getItem('accessToken') || localStorage.getItem('auth_token')) && (
                <div className="absolute bottom-[-3rem] right-[-1.5rem] bg-yellow-400 text-gray-900 px-4 py-2 rounded-lg font-bold shadow-lg">
                  <span className="text-2xl">360°</span> Experience
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-bold text-indigo-600 mb-2">{stat.number}</div>
                <div className="text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Powerful Features for Amazing Tours
            </h2>
            <p className="text-xl text-gray-600">
              Everything you need to create and share immersive virtual experiences
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-200 border border-gray-100"
              >
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Perfect for Every Industry
            </h2>
            <p className="text-xl text-gray-600">
              Discover how virtual tours can transform your business
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((useCase) => (
              <div
                key={useCase.title}
                className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 text-center group hover:-translate-y-1"
              >
                <div className="text-5xl mb-4">{useCase.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{useCase.title}</h3>
                <p className="text-gray-600">{useCase.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Pricing />

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              What Our Customers Say
            </h2>
            <p className="text-xl text-gray-600">
              Join thousands of satisfied users worldwide
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial) => (
              <div
                key={testimonial.name}
                className="bg-gray-50 p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow duration-200"
              >
                <div className="flex text-yellow-400 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-current" />
                  ))}
                </div>
                <p className="text-gray-700 mb-6 italic">"{testimonial.content}"</p>
                <div className="flex items-center">
                  <img
                    src={testimonial.image}
                    alt={testimonial.name}
                    className="w-12 h-12 rounded-full mr-4"
                  />
                  <div>
                    <div className="font-semibold text-gray-900">{testimonial.name}</div>
                    <div className="text-sm text-gray-600">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-indigo-600 text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl mb-8 text-indigo-100">
            Join thousands of users creating amazing virtual experiences
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-white text-indigo-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors duration-200 flex items-center justify-center gap-2">
              Start Your Free Trial
              <ArrowRight className="w-5 h-5" />
            </button>
            <button className="border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-indigo-600 transition-all duration-200">
              Schedule a Demo
            </button>
          </div>
          <p className="mt-6 text-indigo-200">
            No credit card required • 14-day free trial • Cancel anytime
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HomePage;