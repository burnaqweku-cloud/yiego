import AdminLayout from './AdminLayout';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, ExternalLink, FileText, Globe, MapPin } from 'lucide-react';
import SEOHead from '@/components/seo/SEOHead';

const INDEXED_PAGES = [
  { path: '/', label: 'Homepage' },
  { path: '/buy-data', label: 'Buy Data' },
  { path: '/faq', label: 'FAQ' },
  { path: '/support', label: 'Support' },
  { path: '/blog', label: 'Blog' },
  { path: '/buy-mtn-data-bundles-ghana', label: 'MTN Landing' },
  { path: '/buy-telecel-data-bundles-ghana', label: 'Telecel Landing' },
  { path: '/buy-airteltigo-data-bundles-ghana', label: 'AirtelTigo Landing' },
  { path: '/cheap-data-bundles-ghana', label: 'Cheap Data' },
  { path: '/buy-data-online-ghana', label: 'Buy Online' },
  { path: '/mtn-data-prices-ghana', label: 'MTN Prices' },
  { path: '/telecel-data-prices-ghana', label: 'Telecel Prices' },
  { path: '/airteltigo-data-prices-ghana', label: 'AirtelTigo Prices' },
  { path: '/terms', label: 'Terms' },
  { path: '/privacy', label: 'Privacy' },
  { path: '/track-order', label: 'Track Order' },
  { path: '/become-an-agent', label: 'Become Agent' },
];

const NOINDEX_PAGES = [
  '/admin/*', '/dashboard/*', '/agent/dashboard/*',
  '/checkout', '/paystack/*', '/auth', '/reset-password',
];

const AdminSEO = () => {
  const { data: blogCount } = useQuery({
    queryKey: ['blog-count'],
    queryFn: async () => {
      const { count } = await supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('published', true);
      return count || 0;
    },
  });

  return (
    <AdminLayout>
      <SEOHead title="SEO Tools | Admin" noIndex />
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-display font-bold mb-1">SEO Tools</h1>
          <p className="text-sm text-muted-foreground">Overview of site SEO configuration and indexing status</p>
        </div>

        {/* Overview cards */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Indexed Pages</h3>
            </div>
            <p className="text-2xl font-bold">{INDEXED_PAGES.length}</p>
            <p className="text-xs text-muted-foreground">Public pages in sitemap</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Blog Posts</h3>
            </div>
            <p className="text-2xl font-bold">{blogCount ?? '–'}</p>
            <p className="text-xs text-muted-foreground">Published articles</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Sitemap</h3>
            </div>
            <a href="https://yiego.com/sitemap.xml" target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1">
              sitemap.xml <ExternalLink className="w-3 h-3" />
            </a>
            <a href="https://yiego.com/robots.txt" target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1 mt-1">
              robots.txt <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* SEO Configuration */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3">SEO Configuration</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Dynamic SEO meta tags on all pages</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Canonical URLs configured</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Open Graph tags (og:title, og:description, og:image)</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Twitter Card meta tags</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Organization schema (JSON-LD)</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Website schema with search action</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> LocalBusiness schema (Ghana)</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> FAQ page schema markup</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Article schema on blog posts</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> Breadcrumb schema on all pages</div>
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-success" /> OG image configured</div>
          </div>
        </div>

        {/* Indexed Pages */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Indexed Pages (In Sitemap)</h3>
          <div className="space-y-1.5">
            {INDEXED_PAGES.map(p => (
              <div key={p.path} className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-3.5 h-3.5 text-success shrink-0" />
                <span className="font-mono text-xs text-muted-foreground">{p.path}</span>
                <span className="text-xs">{p.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Noindex Pages */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Blocked from Indexing</h3>
          <div className="space-y-1.5">
            {NOINDEX_PAGES.map(p => (
              <div key={p} className="flex items-center gap-2 text-sm">
                <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                <span className="font-mono text-xs text-muted-foreground">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSEO;
