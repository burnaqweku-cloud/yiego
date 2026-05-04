import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/home/HeroSection';
import ServiceHub from '@/components/home/ServiceHub';
import HowItWorks from '@/components/home/HowItWorks';
import NetworkCards from '@/components/home/NetworkCards';
import WhyChooseUs from '@/components/home/WhyChooseUs';
import FAQPreview from '@/components/home/FAQPreview';
import BlogPreview from '@/components/home/BlogPreview';
import FinalCTA from '@/components/home/FinalCTA';
import SEOHead from '@/components/seo/SEOHead';

const Index = () => {
  return (
    <Layout>
      <SEOHead
        title="YieGo — Your Everyday Digital Wallet | Data, Airtime, Bills & Gift Cards in Ghana"
        description="YieGo is the Ghanaian digital wallet for data bundles, airtime, bill payments, gift cards and more. One account, instant delivery, lowest prices."
        path="/"
      />
      <HeroSection />
      <ServiceHub />
      <HowItWorks />
      <NetworkCards />
      <WhyChooseUs />
      <BlogPreview />
      <FAQPreview />
      <FinalCTA />
    </Layout>
  );
};

export default Index;
