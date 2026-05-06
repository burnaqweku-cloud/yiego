import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/home/HeroSection';
import TrustBand from '@/components/home/TrustBand';
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
        title="YieGo — Your Everyday Digital Plug | Data, Airtime & Bills in Ghana"
        description="YieGo is the Ghanaian digital wallet for data bundles, airtime, bill payments and more. One account, fast delivery, lower prices."
        path="/"
      />
      <HeroSection />
      <TrustBand />
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
