import { useEffect } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQStructuredData = ({ faqs }: { faqs: FAQItem[] }) => {
  useEffect(() => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(faq => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'faq-schema';
    document.getElementById('faq-schema')?.remove();
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);

    return () => { script.remove(); };
  }, [faqs]);

  return null;
};

export default FAQStructuredData;
