import { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Copy, Sparkles, Type, ShoppingCart, Check, Eye, EyeOff, Phone, Link2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

import modelImg1 from '@/assets/banner-model-1.jpg';
import modelImg2 from '@/assets/banner-model-2.jpg';
import modelImg3 from '@/assets/banner-model-3.jpg';

interface MarketingBannerTemplatesProps {
  storeName: string;
  whatsappNumber: string;
  storeUrl: string;
  agentId: string;
}

interface BannerStyle {
  id: string;
  name: string;
  bgGradient: [string, string];
  accent: string;
  accentAlt: string;
  textColor: string;
  textMuted: string;
  ctaBg: string;
  ctaText: string;
  cardBg: string;
  priceRowBg: string;
  modelIndex: number;
  headline: string;
}

const STYLES: BannerStyle[] = [
  {
    id: 'premium-orange', name: 'Premium Orange',
    bgGradient: ['#1a0a00', '#2d1400'],
    accent: '#FF8C00', accentAlt: '#FFA940',
    textColor: '#ffffff', textMuted: '#c0946a',
    ctaBg: '#FF8C00', ctaText: '#ffffff',
    cardBg: 'rgba(255,140,0,0.08)', priceRowBg: 'rgba(255,140,0,0.12)',
    modelIndex: 1, headline: 'Affordable Data Bundles',
  },
  {
    id: 'gold-dark', name: 'Gold & Dark',
    bgGradient: ['#0d0d0d', '#1a1a1a'],
    accent: '#D4A843', accentAlt: '#E8C870',
    textColor: '#ffffff', textMuted: '#8a8074',
    ctaBg: '#D4A843', ctaText: '#0d0d0d',
    cardBg: 'rgba(212,168,67,0.06)', priceRowBg: 'rgba(212,168,67,0.10)',
    modelIndex: 0, headline: 'Buy Data at Better Prices',
  },
  {
    id: 'clean-white', name: 'Clean White',
    bgGradient: ['#f4f4f6', '#ffffff'],
    accent: '#1a1a1a', accentAlt: '#444444',
    textColor: '#111111', textMuted: '#666666',
    ctaBg: '#111111', ctaText: '#ffffff',
    cardBg: 'rgba(0,0,0,0.03)', priceRowBg: 'rgba(0,0,0,0.05)',
    modelIndex: 2, headline: 'Smart Data Deals for You',
  },
  {
    id: 'royal-blue', name: 'Royal Blue',
    bgGradient: ['#060d1e', '#0c1a3a'],
    accent: '#4D8EFF', accentAlt: '#7AB0FF',
    textColor: '#ffffff', textMuted: '#7a9dc4',
    ctaBg: '#4D8EFF', ctaText: '#ffffff',
    cardBg: 'rgba(77,142,255,0.06)', priceRowBg: 'rgba(77,142,255,0.10)',
    modelIndex: 1, headline: 'Easy Data Access Across All Networks',
  },
  {
    id: 'fresh-green', name: 'Fresh Green',
    bgGradient: ['#051510', '#0a2a1f'],
    accent: '#2DD4A0', accentAlt: '#5EECC0',
    textColor: '#ffffff', textMuted: '#6faf96',
    ctaBg: '#2DD4A0', ctaText: '#051510',
    cardBg: 'rgba(45,212,160,0.06)', priceRowBg: 'rgba(45,212,160,0.10)',
    modelIndex: 2, headline: 'Reliable Data Bundles for Everyday Use',
  },
  {
    id: 'modern-gradient', name: 'Modern Gradient',
    bgGradient: ['#0f0520', '#1a0a35'],
    accent: '#C084FC', accentAlt: '#E0B4FE',
    textColor: '#ffffff', textMuted: '#9a80c0',
    ctaBg: '#C084FC', ctaText: '#0f0520',
    cardBg: 'rgba(192,132,252,0.06)', priceRowBg: 'rgba(192,132,252,0.10)',
    modelIndex: 0, headline: 'Better Prices on Data Bundles',
  },
];

const MODEL_IMAGES = [modelImg1, modelImg2, modelImg3];

type Network = 'MTN' | 'Telecel' | 'AirtelTigo';
type BannerMode = 'sales' | 'branding';

const NETWORK_BRAND: Record<Network, { bg: string; text: string; label: string }> = {
  MTN: { bg: '#FFCC00', text: '#000000', label: 'MTN' },
  Telecel: { bg: '#E40613', text: '#ffffff', label: 'Telecel' },
  AirtelTigo: { bg: '#E42313', text: '#ffffff', label: 'AirtelTigo' },
};

const CTA_OPTIONS = ['Buy Data Now', 'Order Your Bundle', 'Get Started', 'Shop Data Deals', 'Buy from My Store'];

interface BundlePrice {
  id: string;
  sizeGB: number;
  price: number;
  network: string;
}

// ---- Canvas-based banner renderer ----

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawNetworkChip(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, h: number, bg: string, text: string) {
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = text;
  ctx.font = `bold ${Math.round(h * 0.5)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}

async function renderBannerToCanvas(
  style: BannerStyle,
  storeName: string,
  phone: string,
  storeUrl: string,
  bundles: BundlePrice[],
  network: Network,
  mode: BannerMode,
  showPhone: boolean,
  showPrices: boolean,
  showLink: boolean,
  ctaText: string,
): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, style.bgGradient[0]);
  grad.addColorStop(1, style.bgGradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Model image on right side
  try {
    const modelSrc = MODEL_IMAGES[style.modelIndex];
    const modelImage = await loadImage(modelSrc);
    const imgW = 480;
    const imgH = H;
    const imgX = W - imgW;

    // Draw model
    ctx.save();
    ctx.drawImage(modelImage, imgX, 0, imgW, imgH);

    // Gradient overlay from left to blend with background
    const overlayGrad = ctx.createLinearGradient(imgX, 0, imgX + imgW, 0);
    overlayGrad.addColorStop(0, style.bgGradient[1]);
    overlayGrad.addColorStop(0.35, style.bgGradient[1] + 'cc');
    overlayGrad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    overlayGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(imgX, 0, imgW, imgH);

    // Bottom gradient overlay for text readability
    const bottomGrad = ctx.createLinearGradient(0, H - 300, 0, H);
    bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
    bottomGrad.addColorStop(1, style.bgGradient[1] + 'ee');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, H - 300, W, 300);
    ctx.restore();
  } catch {
    // Silently continue without model
  }

  const pad = 72;
  let curY = 70;
  const nb = NETWORK_BRAND[network];

  // Accent line
  ctx.fillStyle = style.accent;
  roundRect(ctx, pad, curY, 60, 4, 2);
  ctx.fill();
  curY += 30;

  // Network badge top-right
  drawNetworkChip(ctx, nb.label, W - pad - 160, curY - 10, 160, 44, nb.bg, nb.text);

  // Headline
  ctx.fillStyle = style.textMuted;
  ctx.font = '500 32px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // Wrap headline if long
  const headlineWords = style.headline.split(' ');
  let headlineLines: string[] = [];
  let currentLine = '';
  for (const word of headlineWords) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > 560) {
      headlineLines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) headlineLines.push(currentLine);
  for (const line of headlineLines) {
    ctx.fillText(line, pad, curY);
    curY += 40;
  }

  // Divider
  curY += 8;
  ctx.fillStyle = style.accent;
  ctx.globalAlpha = 0.5;
  roundRect(ctx, pad, curY, 80, 3, 1.5);
  ctx.fill();
  ctx.globalAlpha = 1;
  curY += 28;

  // Store name
  const displayName = storeName.length > 20 ? storeName.slice(0, 18) + '…' : storeName;
  let nameFontSize = 64;
  if (storeName.length > 16) nameFontSize = 52;
  else if (storeName.length > 12) nameFontSize = 58;

  ctx.fillStyle = style.textColor;
  ctx.font = `900 ${nameFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(displayName, pad, curY);
  curY += nameFontSize + 12;

  // Subtitle
  ctx.fillStyle = style.textMuted;
  ctx.font = '400 24px system-ui, -apple-system, sans-serif';
  ctx.fillText('Your trusted data bundle store', pad, curY);
  curY += 50;

  // --- Prices section (sales mode) ---
  if (mode === 'sales' && showPrices && bundles.length > 0) {
    const top6 = bundles.slice(0, 6);
    const colW = 270;
    const rowH = 56;
    const rowGap = 8;
    const col1 = top6.filter((_, i) => i % 2 === 0);
    const col2 = top6.filter((_, i) => i % 2 === 1);
    const maxRows = Math.max(col1.length, col2.length);
    const cardH = maxRows * (rowH + rowGap) + 24;

    // Card background
    ctx.fillStyle = style.cardBg;
    roundRect(ctx, pad - 12, curY - 12, colW * 2 + 48 + 24, cardH, 16);
    ctx.fill();

    const drawCol = (items: BundlePrice[], startX: number) => {
      items.forEach((b, i) => {
        const ry = curY + i * (rowH + rowGap);
        ctx.fillStyle = style.priceRowBg;
        roundRect(ctx, startX, ry, colW, rowH, 10);
        ctx.fill();

        const sizeLabel = b.sizeGB >= 1 ? `${b.sizeGB}GB` : `${Math.round(b.sizeGB * 1000)}MB`;
        ctx.fillStyle = style.textColor;
        ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(sizeLabel, startX + 18, ry + rowH / 2 + 7);

        ctx.fillStyle = style.accent;
        ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`GH₵${b.price.toFixed(2)}`, startX + colW - 18, ry + rowH / 2 + 7);
      });
    };

    drawCol(col1, pad);
    drawCol(col2, pad + colW + 24);
    curY += cardH + 16;
  }

  // Push bottom section to fixed position for consistency
  const bottomY = Math.max(curY + 20, 780);

  // Phone number
  if (showPhone && phone) {
    ctx.fillStyle = style.textColor;
    ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`📞  ${phone}`, W / 2, bottomY);
  }

  // Store link
  if (showLink && storeUrl) {
    const linkY = showPhone && phone ? bottomY + 38 : bottomY;
    ctx.fillStyle = style.textMuted;
    ctx.font = '400 18px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const shortUrl = storeUrl.replace(/^https?:\/\//, '').slice(0, 50);
    ctx.fillText(shortUrl, W / 2, linkY);
  }

  // CTA Button
  const ctaY = 880;
  const ctaW = 380;
  const ctaH = 64;
  const ctaX = (W - ctaW) / 2;
  ctx.fillStyle = style.ctaBg;
  roundRect(ctx, ctaX, ctaY, ctaW, ctaH, ctaH / 2);
  ctx.fill();
  ctx.fillStyle = style.ctaText;
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ctaText.toUpperCase(), W / 2, ctaY + ctaH / 2);

  // Network chips row
  const chipY = 968;
  const chipH = 34;
  const networks: Network[] = ['MTN', 'Telecel', 'AirtelTigo'];
  const chipWidths = [110, 110, 140];
  const totalChipW = chipWidths.reduce((a, b) => a + b, 0) + 24;
  let chipX = (W - totalChipW) / 2;
  networks.forEach((n, i) => {
    const nb2 = NETWORK_BRAND[n];
    drawNetworkChip(ctx, nb2.label, chipX, chipY, chipWidths[i], chipH, nb2.bg, nb2.text);
    chipX += chipWidths[i] + 12;
  });

  // Footer branding
  ctx.fillStyle = style.textMuted;
  ctx.globalAlpha = 0.3;
  ctx.font = '400 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Powered by YieGo', W / 2, H - 18);
  ctx.globalAlpha = 1;

  return canvas;
}

// ---- Small SVG preview for style grid ----
function buildPreviewSVG(
  s: BannerStyle, storeName: string, mode: BannerMode, network: Network,
  bundles: BundlePrice[], showPrices: boolean,
): string {
  const displayName = storeName.length > 14 ? storeName.slice(0, 12) + '…' : storeName;
  const nb = NETWORK_BRAND[network];
  const isSales = mode === 'sales' && showPrices;
  const top3 = bundles.slice(0, 3);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <defs>
      <linearGradient id="pbg_${s.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${s.bgGradient[0]}"/>
        <stop offset="100%" stop-color="${s.bgGradient[1]}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#pbg_${s.id})"/>

    <!-- Right side model placeholder -->
    <rect x="260" y="0" width="140" height="400" fill="${s.accent}" opacity="0.04"/>

    <!-- Accent line -->
    <rect x="24" y="24" width="30" height="3" rx="1.5" fill="${s.accent}" opacity="0.6"/>

    <!-- Network badge -->
    <rect x="290" y="24" width="85" height="22" rx="11" fill="${nb.bg}"/>
    <text x="332" y="39" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" font-weight="800" fill="${nb.text}">${nb.label}</text>

    <!-- Headline -->
    <text x="24" y="70" font-family="system-ui, sans-serif" font-size="11" font-weight="500" fill="${s.textMuted}">${s.headline.slice(0, 28)}</text>
    <rect x="24" y="80" width="30" height="2" rx="1" fill="${s.accent}" opacity="0.5"/>

    <!-- Store Name -->
    <text x="24" y="115" font-family="system-ui, sans-serif" font-size="24" font-weight="900" fill="${s.textColor}">${displayName}</text>

    <text x="24" y="140" font-family="system-ui, sans-serif" font-size="9" fill="${s.textMuted}">Your trusted data bundle store</text>

    ${isSales ? `
    <rect x="18" y="155" width="240" height="${top3.length * 28 + 14}" rx="8" fill="${s.cardBg}" opacity="0.8"/>
    ${top3.map((b, i) => {
      const sizeLabel = b.sizeGB >= 1 ? `${b.sizeGB}GB` : `${Math.round(b.sizeGB * 1000)}MB`;
      return `
        <rect x="24" y="${162 + i * 28}" width="228" height="22" rx="5" fill="${s.priceRowBg}"/>
        <text x="34" y="${178 + i * 28}" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="${s.textColor}">${sizeLabel}</text>
        <text x="242" y="${178 + i * 28}" text-anchor="end" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="${s.accent}">GH₵${b.price.toFixed(2)}</text>
      `;
    }).join('')}
    ` : `
    <g transform="translate(24, 165)">
      ${(['MTN', 'Telecel', 'AirtelTigo'] as const).map((n, i) => {
        const nb2 = NETWORK_BRAND[n];
        const cw = n === 'AirtelTigo' ? 70 : 55;
        const xo = i === 0 ? 0 : i === 1 ? 62 : 124;
        return `
          <rect x="${xo}" y="0" width="${cw}" height="20" rx="10" fill="${nb2.bg}" opacity="0.85"/>
          <text x="${xo + cw / 2}" y="14" text-anchor="middle" font-family="system-ui, sans-serif" font-size="8" font-weight="700" fill="${nb2.text}">${n}</text>
        `;
      }).join('')}
    </g>
    `}

    <!-- CTA -->
    <rect x="80" y="340" width="160" height="30" rx="15" fill="${s.ctaBg}"/>
    <text x="160" y="360" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" font-weight="800" fill="${s.ctaText}">BUY DATA NOW</text>

    <text x="200" y="392" text-anchor="middle" font-family="system-ui, sans-serif" font-size="6" fill="${s.textMuted}" opacity="0.3">Powered by YieGo</text>
  </svg>`;
}

// ---- COMPONENT ----

const MarketingBannerTemplates = ({ storeName, whatsappNumber, storeUrl, agentId }: MarketingBannerTemplatesProps) => {
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0].id);
  const [network, setNetwork] = useState<Network>('MTN');
  const [mode, setMode] = useState<BannerMode>('sales');
  const [bundles, setBundles] = useState<BundlePrice[]>([]);
  const [allBundles, setAllBundles] = useState<BundlePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [customSelection, setCustomSelection] = useState(false);
  const [selectedBundleIds, setSelectedBundleIds] = useState<Set<string>>(new Set());
  const [showPhone, setShowPhone] = useState(true);
  const [showPrices, setShowPrices] = useState(true);
  const [showLink, setShowLink] = useState(true);
  const [ctaText, setCtaText] = useState(CTA_OPTIONS[0]);

  // Fetch products + agent pricing
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [productsRes, pricingRes] = await Promise.all([
          supabase.from('products').select('id, network, bundle_size_gb, price_ghs, cost_price_ghs, active').eq('active', true),
          supabase.from('agent_pricing' as any).select('product_id, custom_price, markup_percent').eq('agent_id', agentId),
        ]);

        const products = (productsRes.data || []) as any[];
        const agentPricing = (pricingRes.data || []) as any[];

        const pricingMap = new Map<string, { custom_price: number | null; markup_percent: number | null }>();
        agentPricing.forEach((ap: any) => {
          pricingMap.set(ap.product_id, { custom_price: ap.custom_price, markup_percent: ap.markup_percent });
        });

        const computed: BundlePrice[] = products
          .filter((p: any) => p.active)
          .map((p: any) => {
            const agentP = pricingMap.get(p.id);
            let price = Number(p.price_ghs);
            if (agentP?.custom_price && agentP.custom_price > 0) {
              price = agentP.custom_price;
            } else if (agentP?.markup_percent != null) {
              const basePrice = Number(p.cost_price_ghs || p.price_ghs);
              price = basePrice * (1 + agentP.markup_percent / 100);
              price = Math.round(price * 100) / 100;
            }
            return { id: p.id, sizeGB: Number(p.bundle_size_gb), price, network: String(p.network) };
          })
          .sort((a, b) => a.sizeGB - b.sizeGB);

        setAllBundles(computed);
      } catch (err) {
        console.error('Failed to fetch bundle pricing:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [agentId]);

  const networkBundles = useMemo(() =>
    allBundles.filter(b => b.network.toLowerCase() === network.toLowerCase()),
    [allBundles, network]
  );

  useEffect(() => {
    if (!customSelection) {
      setBundles(networkBundles.slice(0, 6));
      setSelectedBundleIds(new Set(networkBundles.slice(0, 6).map(b => b.id)));
    } else {
      setBundles(networkBundles.filter(b => selectedBundleIds.has(b.id)));
    }
  }, [networkBundles, customSelection, selectedBundleIds]);

  const toggleBundle = (id: string) => {
    setSelectedBundleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 6) next.add(id);
      else toast.error('Maximum 6 bundles');
      return next;
    });
  };

  const style = STYLES.find(s => s.id === selectedStyle)!;

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const displayBundles = customSelection
        ? networkBundles.filter(b => selectedBundleIds.has(b.id))
        : networkBundles.slice(0, 6);

      const canvas = await renderBannerToCanvas(
        style, storeName, whatsappNumber, storeUrl,
        displayBundles, network, mode,
        showPhone, showPrices, showLink, ctaText,
      );

      const link = document.createElement('a');
      link.download = `${storeName.replace(/\s+/g, '-')}-${network}-${style.id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Banner downloaded!');
    } catch (err) {
      toast.error('Failed to generate banner');
      console.error(err);
    } finally {
      setDownloading(false);
    }
  }, [style, storeName, whatsappNumber, storeUrl, network, mode, networkBundles, customSelection, selectedBundleIds, showPhone, showPrices, showLink, ctaText]);

  const handleCopyCaption = () => {
    const displayBundles = customSelection
      ? networkBundles.filter(b => selectedBundleIds.has(b.id))
      : networkBundles.slice(0, 3);
    const priceLines = displayBundles.map(b => {
      const sizeLabel = b.sizeGB >= 1 ? `${b.sizeGB}GB` : `${Math.round(b.sizeGB * 1000)}MB`;
      return `${sizeLabel} — GH₵${b.price.toFixed(2)}`;
    }).join('\n');
    const caption = `Get affordable ${network} data bundles\n\n${priceLines}\n\nReliable and trusted\nOrder now: ${storeUrl}`;
    navigator.clipboard.writeText(caption);
    toast.success('Caption copied!');
  };

  const previews = useMemo(() => {
    const displayBundles = customSelection
      ? networkBundles.filter(b => selectedBundleIds.has(b.id))
      : networkBundles.slice(0, 6);
    return STYLES.map(s => ({
      style: s,
      svg: buildPreviewSVG(s, storeName, mode, network, displayBundles, showPrices),
    }));
  }, [storeName, mode, network, networkBundles, customSelection, selectedBundleIds, showPrices]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-primary" /> Marketing Banners
        </h3>
        <p className="text-[11px] text-muted-foreground">Generate premium banners with your real prices</p>
      </div>

      {/* Banner Mode */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground">Banner Type</label>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('sales')}
            className={cn(
              'text-[11px] px-4 py-2 rounded-lg border transition-all font-medium flex items-center gap-1.5 flex-1',
              mode === 'sales'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            )}
          >
            <ShoppingCart className="w-3.5 h-3.5" /> Sales Banner
          </button>
          <button
            onClick={() => setMode('branding')}
            className={cn(
              'text-[11px] px-4 py-2 rounded-lg border transition-all font-medium flex items-center gap-1.5 flex-1',
              mode === 'branding'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            )}
          >
            <Type className="w-3.5 h-3.5" /> Branding Banner
          </button>
        </div>
      </div>

      {/* Network Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground">Network</label>
        <div className="flex gap-2">
          {(['MTN', 'Telecel', 'AirtelTigo'] as const).map(n => {
            const nb = NETWORK_BRAND[n];
            const isActive = network === n;
            return (
              <button
                key={n}
                onClick={() => { setNetwork(n); setCustomSelection(false); }}
                className={cn(
                  'text-xs px-4 py-2 rounded-full border-2 transition-all font-bold flex-1',
                  isActive ? 'shadow-sm scale-[1.02]' : 'opacity-60 hover:opacity-80'
                )}
                style={{
                  backgroundColor: isActive ? nb.bg : 'transparent',
                  color: isActive ? nb.text : undefined,
                  borderColor: nb.bg,
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* Toggle Controls */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground">Display Options</label>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Phone', icon: Phone, value: showPhone, set: setShowPhone },
            { label: 'Prices', icon: DollarSign, value: showPrices, set: setShowPrices },
            { label: 'Store Link', icon: Link2, value: showLink, set: setShowLink },
          ].map(({ label, icon: Icon, value, set }) => (
            <button
              key={label}
              onClick={() => set(!value)}
              className={cn(
                'text-[11px] px-3 py-1.5 rounded-lg border transition-all font-medium flex items-center gap-1.5',
                value
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/30 border-border text-muted-foreground'
              )}
            >
              <Icon className="w-3 h-3" />
              {label}
              {value ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
          ))}
        </div>
      </div>

      {/* CTA Text Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground">CTA Button Text</label>
        <div className="flex flex-wrap gap-1.5">
          {CTA_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setCtaText(opt)}
              className={cn(
                'text-[10px] px-3 py-1.5 rounded-full border transition-all font-medium',
                ctaText === opt
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Bundle Selection (sales mode only) */}
      {mode === 'sales' && showPrices && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground">
              Bundles {customSelection ? `(${selectedBundleIds.size}/6)` : '(Top 6 auto)'}
            </label>
            <button
              onClick={() => setCustomSelection(!customSelection)}
              className="text-[10px] text-primary font-medium hover:underline"
            >
              {customSelection ? 'Use Auto' : 'Custom Select'}
            </button>
          </div>

          {customSelection && (
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
              {networkBundles.map(b => {
                const selected = selectedBundleIds.has(b.id);
                const sizeLabel = b.sizeGB >= 1 ? `${b.sizeGB}GB` : `${Math.round(b.sizeGB * 1000)}MB`;
                return (
                  <button
                    key={b.id}
                    onClick={() => toggleBundle(b.id)}
                    className={cn(
                      'text-[11px] px-3 py-2 rounded-lg border transition-all flex items-center justify-between',
                      selected
                        ? 'bg-primary/10 border-primary text-foreground'
                        : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    <span className="font-medium">{sizeLabel}</span>
                    <span className="flex items-center gap-1">
                      <span className="font-bold">GH₵{b.price.toFixed(2)}</span>
                      {selected && <Check className="w-3 h-3 text-primary" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {loading && (
            <p className="text-[10px] text-muted-foreground animate-pulse">Loading bundle prices...</p>
          )}
        </div>
      )}

      {/* Style Grid */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground">Choose Style</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {previews.map(({ style: s, svg }) => {
            const isSelected = selectedStyle === s.id;
            return (
              <div
                key={s.id}
                onClick={() => setSelectedStyle(s.id)}
                className={cn(
                  'relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all',
                  isSelected
                    ? 'border-primary ring-2 ring-primary/30 scale-[1.02]'
                    : 'border-border hover:border-primary/40'
                )}
              >
                <div className="aspect-square" dangerouslySetInnerHTML={{ __html: svg }} />
                <div className="p-2 bg-card flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-foreground">{s.name}</span>
                  {isSelected && (
                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Selected</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <Button onClick={handleDownload} disabled={downloading} className="w-full gap-2 text-sm font-bold">
          <Download className="w-4 h-4" />
          {downloading ? 'Generating...' : 'Download PNG (1080×1080)'}
        </Button>
        {mode === 'sales' && showPrices && (
          <Button variant="outline" onClick={handleCopyCaption} className="w-full gap-2 text-sm">
            <Copy className="w-4 h-4" /> Copy Caption
          </Button>
        )}
      </div>
    </div>
  );
};

export default MarketingBannerTemplates;
