import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/home/HeroSection';
import NetworkCards from '@/components/home/NetworkCards';
import WhyChooseUs from '@/components/home/WhyChooseUs';
import AccountBenefits from '@/components/home/AccountBenefits';
import FAQPreview from '@/components/home/FAQPreview';
import SupportSection from '@/components/home/SupportSection';
import SEOContentSection from '@/components/home/SEOContentSection';
import BlogPreview from '@/components/home/BlogPreview';
import SEOHead from '@/components/seo/SEOHead';

const Index = () => {
  return (
    <Layout>
      <SEOHead
        title="DataSika — Ghana's Cheapest Data Bundles | Buy MTN, Telecel & AirtelTigo Online"
        description="Buy the cheapest MTN, Telecel & AirtelTigo data bundles in Ghana on DataSika. Instant delivery, lowest prices, plus earn money as a data reseller. Top up now."
        path="/"
      />
      <HeroSection />
      <NetworkCards />
      <WhyChooseUs />
      <AccountBenefits />
      <SEOContentSection />
      <BlogPreview />
      <FAQPreview />
      <SupportSection />
    </Layout>
  );
};

export default Index;
