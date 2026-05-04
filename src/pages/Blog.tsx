import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, ArrowRight, Tag } from 'lucide-react';
import { format } from 'date-fns';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

const Blog = () => {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const { data: posts, isLoading } = useQuery({
    queryKey: ['blog-posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, cover_image_url, tags, category, published_at')
        .eq('published', true)
        .order('published_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const allTags = Array.from(new Set((posts || []).flatMap(p => p.tags || [])));
  const filtered = selectedTag
    ? (posts || []).filter(p => p.tags?.includes(selectedTag))
    : posts || [];

  return (
    <Layout>
      <SEOHead
        title="Blog — Data Bundle Tips & Guides for Ghana | DataSika"
        description="Read the latest tips, guides, and news about buying data bundles in Ghana. MTN, Telecel & AirtelTigo bundle guides, pricing updates, and more."
        path="/blog"
      />
      <div className="container py-8 md:py-12 max-w-5xl">
        <Breadcrumbs items={[{ label: 'Blog' }]} />

        <div className="text-center mb-10">
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Insights & Guides</span>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-3 tracking-tight">DataSika Blog</h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
            Tips, guides, and news about buying data bundles in Ghana. Stay informed about MTN, Telecel & AirtelTigo deals.
          </p>
        </div>

        {/* Tags filter */}
        {allTags.length > 0 && (
          <div className="flex justify-center mb-8">
            <div className="surface-premium rounded-2xl p-1.5 inline-flex gap-1 flex-wrap max-w-full">
              <button
                onClick={() => setSelectedTag(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  !selectedTag ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                All Posts
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedTag === tag ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(post => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}`}
                className="group surface-premium rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_-12px_hsl(var(--primary)/0.3)]"
              >
                {post.cover_image_url && (
                  <div className="aspect-video bg-muted overflow-hidden">
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="p-5">
                  {post.published_at && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(post.published_at), 'MMM d, yyyy')}
                    </div>
                  )}
                  <h2 className="font-display font-bold text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{post.excerpt}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      {(post.tags || []).slice(0, 2).map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs font-medium text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                      Read <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No blog posts found.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Blog;
