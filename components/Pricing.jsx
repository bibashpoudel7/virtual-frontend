import React, { useState } from 'react';
import { Check, X, Star, TrendingUp, Users, Globe } from 'lucide-react';

const Pricing = () => {
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  const plans = [
    {
      name: 'Starter',
      icon: Star,
      description: 'Perfect for individuals and small projects',
      monthlyPrice: 29,
      yearlyPrice: 290,
      features: [
        { name: 'Up to 5 virtual tours', included: true },
        { name: 'Basic analytics', included: true },
        { name: '360° photo support', included: true },
        { name: 'Mobile responsive', included: true },
        { name: 'Email support', included: true },
        { name: 'Custom branding', included: false },
        { name: 'API access', included: false },
        { name: 'Priority support', included: false },
      ],
      buttonText: 'Start Free Trial',
      buttonStyle: 'bg-gray-800 hover:bg-gray-900',
      popular: false,
    },
    {
      name: 'Professional',
      icon: TrendingUp,
      description: 'Ideal for growing businesses and teams',
      monthlyPrice: 79,
      yearlyPrice: 790,
      features: [
        { name: 'Up to 25 virtual tours', included: true },
        { name: 'Advanced analytics', included: true },
        { name: '360° photo & video support', included: true },
        { name: 'Mobile responsive', included: true },
        { name: 'Priority email support', included: true },
        { name: 'Custom branding', included: true },
        { name: 'API access', included: true },
        { name: 'Live chat support', included: false },
      ],
      buttonText: 'Start Free Trial',
      buttonStyle: 'bg-indigo-600 hover:bg-indigo-700',
      popular: true,
    },
    {
      name: 'Enterprise',
      icon: Globe,
      description: 'Advanced features for large organizations',
      monthlyPrice: 199,
      yearlyPrice: 1990,
      features: [
        { name: 'Unlimited virtual tours', included: true },
        { name: 'Custom analytics dashboard', included: true },
        { name: 'All media formats supported', included: true },
        { name: 'Mobile responsive', included: true },
        { name: '24/7 phone & email support', included: true },
        { name: 'White-label solution', included: true },
        { name: 'Full API access', included: true },
        { name: 'Dedicated account manager', included: true },
      ],
      buttonText: 'Contact Sales',
      buttonStyle: 'bg-gray-800 hover:bg-gray-900',
      popular: false,
    },
  ];

  const teamFeatures = [
    {
      icon: Users,
      title: 'Team Collaboration',
      description: 'Work together seamlessly with real-time collaboration features',
    },
    {
      icon: Globe,
      title: 'Global CDN',
      description: 'Fast loading times worldwide with our distributed network',
    },
    {
      icon: Star,
      title: 'Premium Support',
      description: 'Get help when you need it with our dedicated support team',
    },
  ];

  const currentPrice = (plan) => {
    return billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
  };

  const savingsPercentage = (plan) => {
    const yearlyCost = plan.yearlyPrice;
    const monthlyEquivalent = plan.monthlyPrice * 12;
    const savings = ((monthlyEquivalent - yearlyCost) / monthlyEquivalent) * 100;
    return Math.round(savings);
  };

  return (
    <section className="py-16 bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Choose Your Perfect Plan
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Start free and scale as you grow. No hidden fees.
          </p>

          <div className="inline-flex items-center bg-white rounded-lg shadow-sm p-1">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                billingPeriod === 'monthly'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                billingPeriod === 'yearly'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Yearly
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                Save up to 20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white rounded-2xl shadow-lg overflow-hidden transform transition-all duration-200 hover:scale-105 ${
                plan.popular ? 'ring-2 ring-indigo-600' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-indigo-600 text-white px-3 py-1 text-sm font-medium rounded-bl-lg">
                  Most Popular
                </div>
              )}

              <div className="p-8">
                <div className="flex items-center justify-between mb-4">
                  <plan.icon className="w-8 h-8 text-indigo-600" />
                  {billingPeriod === 'yearly' && plan.yearlyPrice && (
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded">
                      Save {savingsPercentage(plan)}%
                    </span>
                  )}
                </div>

                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <p className="text-gray-600 mb-6">{plan.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-gray-900">
                    ${currentPrice(plan)}
                  </span>
                  <span className="text-gray-600">
                    /{billingPeriod === 'monthly' ? 'month' : 'year'}
                  </span>
                </div>

                <button
                  className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors duration-200 ${plan.buttonStyle}`}
                >
                  {plan.buttonText}
                </button>

                <div className="mt-8 space-y-4">
                  <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                    Features
                  </h4>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature.name} className="flex items-start">
                        {feature.included ? (
                          <Check className="w-5 h-5 text-green-500 mr-3 flex-shrink-0" />
                        ) : (
                          <X className="w-5 h-5 text-gray-300 mr-3 flex-shrink-0" />
                        )}
                        <span
                          className={`text-sm ${
                            feature.included ? 'text-gray-700' : 'text-gray-400'
                          }`}
                        >
                          {feature.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Why Choose VirtualTours?
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {teamFeatures.map((feature) => (
              <div key={feature.title} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-lg mb-4">
                  <feature.icon className="w-6 h-6 text-indigo-600" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h4>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-600 mb-4">
            All plans include a 14-day free trial. No credit card required.
          </p>
          <p className="text-sm text-gray-500">
            Need a custom solution?{' '}
            <a href="/contact" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Contact our sales team
            </a>
          </p>
        </div>
      </div>
    </section>
  );
};

export default Pricing;