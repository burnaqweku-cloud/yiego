import { useParams, Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, ArrowLeft, Tag, ArrowRight } from 'lucide-react';
import DOMPurify from 'dompurify';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import BlogStructuredData from '@/components/seo/BlogStructuredData';

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: post, isLoading } = useQuery({
    queryKey: ['blog-post', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .eq('published', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: relatedPosts } = useQuery({
    queryKey: ['related-posts', post?.id, post?.tags],
    queryFn: async () => {
      if (!post) return [];
      const { data } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, published_at')
        .eq('published', true)
        .neq('id', post.id)
        .order('published_at', { ascending: false })
        .limit(3);
      return data || [];
    },
    enabled: !!post,
  });

  // Simple markdown-to-HTML renderer with DOMPurify sanitization
  const renderContent = (content: string) => {
    let html = content
      .replace(/^### (.+)$/gm, '<h3 class="text-xl font-display font-bold mt-8 mb-3">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-display font-bold mt-10 mb-4">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-display font-bold mt-10 mb-4">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-primary hover:underline font-medium" rel="noopener noreferrer">$1</a>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-muted-foreground">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-muted-foreground">$2</li>')
      .replace(/\n\n/g, '</p><p class="text-muted-foreground leading-relaxed mb-4">')
      .replace(/- ✅/g, '<li class="ml-4 list-none">✅');
    const raw = `<p class="text-muted-foreground leading-relaxed mb-4">${html}</p>`;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'ul', 'ol', 'li', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'span', 'div'],
      ALLOWED_ATTR: ['class', 'href', 'src', 'alt', 'loading', 'rel', 'target', 'width', 'height'],
      ADD_ATTR: ['rel'],
    });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-8 max-w-3xl">
          <Skeleton className="h-10 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/3 mb-8" />
          <Skeleton className="h-64 w-full rounded-2xl mb-6" />
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!post) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="text-2xl font-display font-bold mb-4">Post Not Found</h1>
          <p className="text-muted-foreground mb-6">This blog post doesn't exist or has been removed.</p>
          <Link to="/blog">
            <Button>Back to Blog</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEOHead
        title={post.seo_title || `${post.title} | DataSika Blog`}
        description={post.meta_description || post.excerpt || ''}
        path={`/blog/${post.slug}`}
        ogImage={post.cover_image_url || undefined}
      />
      <BlogStructuredData post={post} />

      <article className="container py-8 md:py-12 max-w-3xl">
        <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: post.title }]} />

        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Blog
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4 leading-tight">{post.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {post.published_at && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(post.published_at), 'MMMM d, yyyy')}
              </span>
            )}
            {(post.tags || []).map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
          </div>
        </header>

        {post.cover_image_url && (
          <div className="rounded-2xl overflow-hidden mb-8 aspect-video bg-muted">
            <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" loading="lazy" />
          </div>
        )}

        <div
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: renderContent(post.content) }}
        />

        {/* CTA */}
        <div className="mt-12 p-6 bg-primary/5 border border-primary/20 rounded-2xl text-center">
          <h3 className="font-display font-bold text-lg mb-2">Ready to Buy Data?</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Get affordable MTN, Telecel & AirtelTigo data bundles with fast delivery.
          </p>
          <Link to="/buy-data">
            <Button className="gap-2">
              Buy Data Now <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {/* Related Posts */}
        {relatedPosts && relatedPosts.length > 0 && (
          <div className="mt-12 pt-8 border-t border-border">
            <h3 className="font-display font-bold text-xl mb-6">Related Articles</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {relatedPosts.map(rp => (
                <Link
                  key={rp.id}
                  to={`/blog/${rp.slug}`}
                  className="group p-4 bg-card border border-border rounded-xl hover:shadow-md transition-shadow"
                >
                  <h4 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors line-clamp-2">
                    {rp.title}
                  </h4>
                  {rp.published_at && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(rp.published_at), 'MMM d, yyyy')}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </Layout>
  );
};

export default BlogPost;
