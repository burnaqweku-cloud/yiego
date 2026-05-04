-- Blog posts table for SEO content
CREATE TABLE public.blog_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  seo_title TEXT,
  meta_description TEXT,
  content TEXT NOT NULL DEFAULT '',
  excerpt TEXT,
  cover_image_url TEXT,
  tags TEXT[] DEFAULT '{}',
  category TEXT DEFAULT 'general',
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMP WITH TIME ZONE,
  author_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can read published posts
CREATE POLICY "Anyone can view published blog posts"
ON public.blog_posts
FOR SELECT
USING (published = true);

-- Admins can manage all posts
CREATE POLICY "Admins can manage blog posts"
ON public.blog_posts
FOR ALL
USING (is_admin());

-- Staff can view all posts
CREATE POLICY "Staff can view all blog posts"
ON public.blog_posts
FOR SELECT
USING (is_admin_or_staff());

-- Trigger for updated_at
CREATE TRIGGER update_blog_posts_updated_at
BEFORE UPDATE ON public.blog_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for slug lookups
CREATE INDEX idx_blog_posts_slug ON public.blog_posts (slug);
CREATE INDEX idx_blog_posts_published ON public.blog_posts (published, published_at DESC);

-- Insert starter blog posts
INSERT INTO public.blog_posts (title, slug, seo_title, meta_description, content, excerpt, tags, category, published, published_at) VALUES
(
  'How to Buy MTN Data Bundles in Ghana Easily',
  'how-to-buy-mtn-data-bundles-ghana',
  'How to Buy MTN Data Bundles in Ghana Easily | DataSika',
  'Learn how to buy MTN data bundles in Ghana quickly and affordably. Step-by-step guide to purchasing MTN data online with Mobile Money.',
  E'# How to Buy MTN Data Bundles in Ghana Easily\n\nBuying MTN data bundles in Ghana has never been easier. Whether you need data for browsing, streaming, or working online, DataSika offers the fastest and most affordable way to get MTN data bundles delivered to your phone.\n\n## Why Buy MTN Data from DataSika?\n\nMTN Ghana is the largest mobile network in the country, serving millions of Ghanaians with reliable internet connectivity. At DataSika, we make it simple to purchase MTN data bundles without the hassle of USSD codes or visiting physical shops.\n\n### Benefits of Using DataSika for MTN Data\n\n- **Fast Delivery**: Your MTN data bundle is delivered within minutes of payment\n- **No Account Required**: Buy data as a guest — no signup needed\n- **Secure Payments**: Pay safely with Mobile Money (MoMo) or bank card via Paystack\n- **Affordable Prices**: We offer competitive prices on all MTN data bundles\n- **Non-Expiry Bundles**: Most of our MTN bundles do not expire\n- **24/7 Availability**: Buy data anytime, day or night\n\n## Step-by-Step: How to Buy MTN Data on DataSika\n\n1. **Visit DataSika**: Go to [datasika.com/buy-data](https://datasika.com/buy-data) and select MTN\n2. **Choose Your Bundle**: Pick from 1GB, 2GB, 3GB, 5GB, 10GB, 15GB, or 20GB bundles\n3. **Enter Phone Number**: Type the MTN number that will receive the data\n4. **Pay Securely**: Complete payment via Mobile Money or card\n5. **Receive Data**: Your bundle is delivered automatically\n\n## MTN Data Bundle Prices in Ghana\n\nDataSika offers competitive pricing on all MTN data bundles. Prices start from as low as GHS 5 for 1GB. Visit our [Buy Data page](https://datasika.com/buy-data?network=MTN) to see current prices.\n\n## Can I Buy MTN Data for Another Person?\n\nYes! You can buy MTN data bundles for any MTN Ghana number. Simply enter the recipient''s phone number during checkout. This makes it easy to gift data to friends and family.\n\n## MTN Data Bundle FAQs\n\n**How long does delivery take?**\nMost MTN data bundles are delivered within 1-5 minutes after payment confirmation.\n\n**What if I enter the wrong number?**\nUnfortunately, once data is delivered to a number, it cannot be reversed. Please double-check the recipient number before confirming.\n\n**Can I buy MTN data without an account?**\nYes, DataSika allows guest purchases. No account signup is required.\n\n**Is DataSika legit?**\nAbsolutely! DataSika is a trusted data bundle delivery platform in Ghana with secure Paystack payment processing.\n\n## Start Buying MTN Data Today\n\nDon''t waste time with USSD codes or long queues. Buy your MTN data bundles online at DataSika and enjoy fast, reliable delivery.\n\n[Buy MTN Data Now →](https://datasika.com/buy-data?network=MTN)',
  'Learn how to buy MTN data bundles in Ghana quickly and affordably with DataSika. Fast delivery, secure payments, no account required.',
  ARRAY['MTN', 'data bundles', 'Ghana', 'mobile data', 'how to'],
  'guides',
  true,
  now()
),
(
  'Telecel Data Bundle Prices in Ghana (Updated 2026)',
  'telecel-data-bundle-prices-ghana',
  'Telecel Data Bundle Prices in Ghana 2026 | DataSika',
  'Check the latest Telecel (formerly Vodafone) data bundle prices in Ghana. Buy affordable Telecel data online with fast delivery.',
  E'# Telecel Data Bundle Prices in Ghana (Updated 2026)\n\nLooking for the best Telecel data bundle prices in Ghana? DataSika offers affordable Telecel data bundles with fast delivery and secure payment options.\n\n## About Telecel Ghana\n\nTelecel (formerly Vodafone Ghana) is one of Ghana''s major telecommunications providers, offering reliable mobile data services across the country. Whether you''re in Accra, Kumasi, Tamale, or anywhere in Ghana, Telecel provides quality internet connectivity.\n\n## Current Telecel Data Bundle Prices\n\nDataSika offers competitive prices on all Telecel data bundles:\n\n- **1GB Telecel Data** — Starting from GHS 5\n- **2GB Telecel Data** — Starting from GHS 9.50\n- **5GB Telecel Data** — Starting from GHS 21\n- **10GB Telecel Data** — Starting from GHS 38\n- **15GB Telecel Data** — Starting from GHS 52\n\nPrices are updated regularly to ensure you always get the best deal. Visit our [Telecel bundles page](https://datasika.com/buy-data?network=Telecel) for live pricing.\n\n## How to Buy Telecel Data Online\n\nBuying Telecel data through DataSika is straightforward:\n\n1. Visit [datasika.com/buy-data](https://datasika.com/buy-data)\n2. Filter by Telecel network\n3. Select your preferred data bundle size\n4. Enter the recipient Telecel phone number\n5. Pay with Mobile Money (MoMo) or card\n6. Data is delivered automatically\n\n## Why Choose DataSika for Telecel Data?\n\n### Fast Delivery\nWe deliver Telecel data bundles quickly after payment confirmation. No waiting, no delays.\n\n### Secure Payment\nAll payments are processed through Paystack, Ghana''s leading payment gateway. Your money is safe.\n\n### Non-Expiry Bundles\nOur Telecel data bundles come with non-expiry validity, giving you more value for your money.\n\n### No Account Needed\nYou can buy Telecel data as a guest. No registration or login required.\n\n## Telecel Data Tips\n\n- **Buy in bulk**: Larger bundles offer better value per GB\n- **Track your order**: Use our order tracking feature to monitor delivery status\n- **Create an account**: While not required, having an account lets you track order history and use wallet for faster checkout\n\n## Frequently Asked Questions\n\n**Does DataSika sell Telecel data?**\nYes! We offer all popular Telecel data bundle sizes.\n\n**How long does Telecel data delivery take?**\nMost orders are delivered within minutes of payment.\n\n**Can I buy Telecel data for someone else?**\nYes, just enter their Telecel number as the recipient.\n\n[Buy Telecel Data Now →](https://datasika.com/buy-data?network=Telecel)',
  'Check the latest Telecel data bundle prices in Ghana for 2026. Buy affordable Telecel data online at DataSika with fast delivery.',
  ARRAY['Telecel', 'data bundles', 'Ghana', 'prices', 'Vodafone'],
  'pricing',
  true,
  now()
),
(
  'AirtelTigo Data Bundles and Best Deals in Ghana',
  'airteltigo-data-bundles-best-deals-ghana',
  'AirtelTigo Data Bundles & Best Deals in Ghana | DataSika',
  'Find the best AirtelTigo data bundle deals in Ghana. Buy affordable AirtelTigo data online with instant delivery via DataSika.',
  E'# AirtelTigo Data Bundles and Best Deals in Ghana\n\nAirtelTigo offers some of the most affordable data bundles in Ghana. At DataSika, we make it easy to purchase AirtelTigo data bundles online with fast delivery and secure payment.\n\n## Why AirtelTigo Data?\n\nAirtelTigo (AT) is known for offering competitive data prices in Ghana. Their network covers major cities and rural areas, making it a popular choice for Ghanaians looking for affordable internet access.\n\n## AirtelTigo Data Bundle Prices\n\nHere are the current AirtelTigo data bundle prices available on DataSika:\n\n- **1GB AirtelTigo Data** — Starting from GHS 4.50\n- **2GB AirtelTigo Data** — Starting from GHS 8.50\n- **5GB AirtelTigo Data** — Starting from GHS 20\n- **10GB AirtelTigo Data** — Starting from GHS 36\n- **20GB AirtelTigo Data** — Starting from GHS 65\n\nAll bundles are non-expiry and delivered fast.\n\n## Best AirtelTigo Data Deals\n\n### Value for Money\nAirtelTigo consistently offers the lowest per-GB prices among Ghana''s networks. If you''re budget-conscious, AirtelTigo bundles give you more data for less money.\n\n### Large Bundles\nTheir 10GB and 20GB bundles are perfect for heavy users who stream videos, download files, or work remotely.\n\n## How to Buy AirtelTigo Data on DataSika\n\n1. Go to [datasika.com/buy-data](https://datasika.com/buy-data?network=AirtelTigo)\n2. Choose your AirtelTigo data bundle\n3. Enter the recipient''s AirtelTigo number\n4. Pay via Mobile Money or card\n5. Data delivered within minutes\n\n## AirtelTigo Data FAQ\n\n**Is AirtelTigo data cheaper than MTN?**\nGenerally yes — AirtelTigo offers lower prices per GB compared to MTN and Telecel.\n\n**Can I buy AirtelTigo data online?**\nYes! DataSika lets you buy AirtelTigo data online with secure payment and fast delivery.\n\n**Do AirtelTigo bundles expire?**\nOur AirtelTigo bundles are non-expiry, giving you flexibility to use your data whenever you want.\n\n[Buy AirtelTigo Data Now →](https://datasika.com/buy-data?network=AirtelTigo)',
  'Find the best AirtelTigo data bundle deals in Ghana. Buy affordable AirtelTigo data online at DataSika with instant delivery.',
  ARRAY['AirtelTigo', 'data bundles', 'Ghana', 'deals', 'affordable'],
  'pricing',
  true,
  now()
),
(
  'Cheap Data Bundles in Ghana: Where to Buy Affordable Data',
  'cheap-data-bundles-ghana',
  'Cheap Data Bundles in Ghana — Buy Affordable Data Online | DataSika',
  'Find the cheapest data bundles in Ghana for MTN, Telecel & AirtelTigo. Compare prices and buy affordable data online at DataSika.',
  E'# Cheap Data Bundles in Ghana: Where to Buy Affordable Data\n\nLooking for cheap data bundles in Ghana? Whether you use MTN, Telecel, or AirtelTigo, DataSika helps you find and buy the most affordable data bundles online.\n\n## Why Data Bundle Prices Matter in Ghana\n\nIn Ghana, mobile data is essential for communication, business, education, and entertainment. Finding affordable data bundles means you can stay connected without breaking the bank.\n\n## Cheapest Data Bundles by Network\n\n### MTN Ghana — Cheap Data Bundles\nMTN offers reliable coverage across Ghana. While not always the cheapest, MTN bundles are dependable:\n- 1GB from GHS 5.50\n- 5GB from GHS 22\n- 10GB from GHS 40\n\n### Telecel Ghana — Affordable Data\nTelecel (formerly Vodafone) offers competitive mid-range pricing:\n- 1GB from GHS 5\n- 5GB from GHS 21\n- 10GB from GHS 38\n\n### AirtelTigo — Most Affordable\nAirtelTigo consistently offers the lowest data prices in Ghana:\n- 1GB from GHS 4.50\n- 5GB from GHS 20\n- 10GB from GHS 36\n\n## Tips for Getting Cheap Data in Ghana\n\n1. **Compare Across Networks**: Check prices for all three networks before buying\n2. **Buy Larger Bundles**: Per-GB cost decreases with larger bundles\n3. **Use DataSika**: Our platform ensures you get competitive prices with fast delivery\n4. **Non-Expiry Bundles**: Choose non-expiry bundles for better value\n5. **Watch for Promotions**: DataSika regularly offers special deals\n\n## Why Buy Data Online Instead of USSD?\n\n- **Convenience**: Buy from your phone or computer in seconds\n- **No Airtime Required**: Pay with Mobile Money or card\n- **Gift Data**: Easily buy data for friends and family\n- **Track Orders**: Monitor your purchase with order tracking\n- **Better Prices**: Online platforms often offer better rates\n\n## DataSika: Ghana''s Best Platform for Cheap Data\n\nDataSika is designed specifically for Ghanaians who want affordable data bundles without hassle:\n\n- ✅ All three networks: MTN, Telecel, AirtelTigo\n- ✅ Secure Paystack payments (MoMo + Card)\n- ✅ Fast delivery\n- ✅ No account required\n- ✅ Non-expiry bundles\n- ✅ 24/7 availability\n\n## Start Saving on Data Today\n\nVisit DataSika and compare data bundle prices across all networks. Find the cheapest bundle that fits your needs.\n\n[Compare Data Prices →](https://datasika.com/buy-data)',
  'Find the cheapest data bundles in Ghana. Compare MTN, Telecel & AirtelTigo prices and buy affordable data online at DataSika.',
  ARRAY['cheap data', 'affordable', 'Ghana', 'data bundles', 'compare prices'],
  'guides',
  true,
  now()
),
(
  'How to Check MTN, Telecel and AirtelTigo Data Balance',
  'check-data-balance-ghana',
  'How to Check Data Balance — MTN, Telecel & AirtelTigo Ghana | DataSika',
  'Learn how to check your data balance on MTN, Telecel, and AirtelTigo in Ghana. Quick USSD codes and tips for managing your data.',
  E'# How to Check MTN, Telecel and AirtelTigo Data Balance\n\nKeeping track of your data balance helps you manage your internet usage and know when to top up. Here''s how to check your data balance on all major networks in Ghana.\n\n## Check MTN Data Balance\n\nTo check your MTN data balance in Ghana:\n\n1. **Dial *138*1#** — This shows your remaining data bundle\n2. **Use the MyMTN App** — Download from Play Store or App Store\n3. **Dial *585#** — For detailed account information\n\n### MTN Data Balance Tips\n- Check regularly to avoid running out unexpectedly\n- Set data usage alerts on your phone\n- When running low, top up instantly at [DataSika](https://datasika.com/buy-data?network=MTN)\n\n## Check Telecel Data Balance\n\nTo check your Telecel (formerly Vodafone) data balance:\n\n1. **Dial *700#** — Shows remaining data and bundles\n2. **Use the Telecel App** — Available for Android and iOS\n3. **Text ''BAL'' to 700** — Receive balance via SMS\n\n### Telecel Balance Tips\n- The *700# code gives the most accurate balance information\n- Check both data and airtime balances regularly\n\n## Check AirtelTigo Data Balance\n\nTo check your AirtelTigo data balance:\n\n1. **Dial *141#** — View your current data balance\n2. **Use the AirtelTigo App** — Download from your app store\n3. **Dial *100#** — For comprehensive account details\n\n### AirtelTigo Balance Tips\n- AirtelTigo USSD menus are straightforward and easy to navigate\n- Save the USSD codes in your contacts for quick access\n\n## What to Do When Your Data Runs Out\n\nWhen your data bundle is exhausted, you can quickly buy more through DataSika:\n\n1. Visit [datasika.com/buy-data](https://datasika.com/buy-data)\n2. Select your network (MTN, Telecel, or AirtelTigo)\n3. Choose a bundle size\n4. Enter your phone number\n5. Pay with Mobile Money or card\n6. Data delivered instantly\n\nNo need for USSD codes or airtime balance — just pay and receive your data.\n\n## Data Management Tips\n\n- **Turn off auto-updates**: Save data by updating apps only on WiFi\n- **Use data saver**: Enable browser data compression\n- **Monitor usage**: Check which apps use the most data\n- **Choose non-expiry bundles**: Get more value from your purchase\n\n## Buy Data Instantly on DataSika\n\nDon''t wait until your balance is zero. Buy data bundles in advance and stay connected.\n\n[Buy Data Now →](https://datasika.com/buy-data)',
  'Learn how to check your data balance on MTN, Telecel, and AirtelTigo in Ghana with quick USSD codes.',
  ARRAY['data balance', 'USSD codes', 'MTN', 'Telecel', 'AirtelTigo', 'Ghana'],
  'guides',
  true,
  now()
),
(
  'Why DataSika is the Best Place to Buy Data Bundles in Ghana',
  'why-datasika-best-data-bundles-ghana',
  'Why DataSika is the Best Place to Buy Data Bundles in Ghana',
  'Discover why DataSika is Ghana''s top platform for buying MTN, Telecel & AirtelTigo data bundles. Fast delivery, secure payments, great prices.',
  E'# Why DataSika is the Best Place to Buy Data Bundles in Ghana\n\nWith so many options for buying data in Ghana, why should you choose DataSika? Here are the top reasons why thousands of Ghanaians trust DataSika for their data bundle purchases.\n\n## 1. All Networks in One Place\n\nDataSika supports all three major networks in Ghana:\n- **MTN Ghana** — The largest network\n- **Telecel** — Formerly Vodafone Ghana\n- **AirtelTigo** — The most affordable option\n\nNo need to visit different platforms. Buy data for any network at [datasika.com](https://datasika.com/buy-data).\n\n## 2. Fast Delivery\n\nWe deliver data bundles within minutes of payment confirmation. Our automated system ensures your data reaches your phone quickly.\n\n## 3. Secure Payments\n\nAll payments are processed through Paystack, Ghana''s most trusted payment gateway:\n- **Mobile Money (MoMo)** — MTN MoMo, Telecel Cash, AirtelTigo Money\n- **Bank Cards** — Visa and Mastercard\n- **Wallet** — Pre-load your DataSika wallet for instant checkout\n\n## 4. No Account Required\n\nYou don''t need to create an account to buy data. Simply:\n1. Choose a bundle\n2. Enter the phone number\n3. Pay\n4. Receive data\n\nIt''s that simple.\n\n## 5. Affordable Prices\n\nWe negotiate competitive rates to offer you the best prices on data bundles. Compare our prices and see the value.\n\n## 6. Non-Expiry Bundles\n\nMost of our data bundles come with non-expiry validity. Use your data at your own pace without worrying about expiration.\n\n## 7. 24/7 Availability\n\nDataSika is online around the clock. Buy data at midnight or 6am — we''re always available.\n\n## 8. Order Tracking\n\nTrack your data bundle delivery in real-time using your Order ID. Know exactly when your data will arrive.\n\n## 9. Gift Data Easily\n\nBuying data for someone else is easy. Just enter their phone number as the recipient. Perfect for gifting data to friends, family, or employees.\n\n## 10. Become an Agent\n\nWant to earn money selling data? Join our Agent Program and start your own data bundle business. Set your own prices and earn commissions on every sale.\n\n## What Our Users Say\n\nThousands of Ghanaians use DataSika daily for their data needs. Our platform is built with reliability and simplicity in mind.\n\n## Try DataSika Today\n\nExperience the easiest way to buy data bundles in Ghana. Visit DataSika and make your first purchase in under 2 minutes.\n\n[Start Buying Data →](https://datasika.com/buy-data)\n\n[Create Free Account →](https://datasika.com/auth?tab=signup)',
  'Discover why DataSika is Ghana''s top platform for buying data bundles. Fast delivery, secure payments, all networks supported.',
  ARRAY['DataSika', 'best', 'data bundles', 'Ghana', 'why choose'],
  'general',
  true,
  now()
);