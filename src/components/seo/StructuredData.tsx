import { useEffect } from 'react';

const STRUCTURED_DATA = [
  // Organization
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'DataSika',
    alternateName: 'Datasika',
    url: 'https://datasika.com',
    logo: 'https://datasika.com/datasika-logo.png',
    foundingDate: '2025',
    description:
      "Ghana's cheapest platform for buying MTN, Telecel, and AirtelTigo data bundles online. Lowest prices, fast delivery, plus earn as a data reseller.",
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'GH',
      addressLocality: 'Accra',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@datasika.com',
      areaServed: 'GH',
      availableLanguage: ['English'],
    },
  },
  // WebSite (enables Google Sitelinks Search Box)
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'DataSika',
    url: 'https://datasika.com',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://datasika.com/buy-data?network={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  },
  // LocalBusiness
  {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'DataSika',
    url: 'https://datasika.com',
    image: 'https://datasika.com/datasika-logo.png',
    logo: 'https://datasika.com/datasika-logo.png',
    description:
      'Internet data bundle delivery platform serving MTN, Telecel & AirtelTigo networks across Ghana. Founded 2025.',
    foundingDate: '2025',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'GH',
      addressLocality: 'Accra',
    },
    priceRange: 'GHS',
    currenciesAccepted: 'GHS',
    paymentAccepted: 'Mobile Money, Visa, Mastercard',
    areaServed: {
      '@type': 'Country',
      name: 'Ghana',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        opens: '08:00',
        closes: '20:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Sunday',
        opens: '10:00',
        closes: '18:00',
      },
    ],
  },
];

/**
 * Injects JSON-LD structured data into <head> on mount.
 * Organization, WebSite (with sitelinks search box), and LocalBusiness — applied site-wide.
 * Page-specific schemas (FAQPage, Article, Breadcrumbs) live in their own components.
 */
const StructuredData = () => {
  useEffect(() => {
    const scripts: HTMLScriptElement[] = [];

    STRUCTURED_DATA.forEach((data, i) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = `structured-data-${i}`;
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
      scripts.push(script);
    });

    return () => {
      scripts.forEach((s) => s.remove());
    };
  }, []);

  return null;
};

export default StructuredData;
