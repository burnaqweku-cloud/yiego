import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Calendar } from 'lucide-react';
import { format } from 'date-fns';

const BlogPreview = () => {
  const { data: posts } = useQuery({
    queryKey: ['home-blog-preview'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('id, title, slug, excerpt, category, published_at')
        .eq('published', true)
        .order('published_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 10,
  });

  if (!posts || posts.length === 0) return null;

  return (
    <section className="container py-12 md:py-16 max-w-6xl">
      <div className="flex items-end justify-between mb-8">
        <div>
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
            From the Blog
          </span>
          <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tight">
            Data bundle tips & guides
          </h2>
        </div>
        <Link
          to="/blog"
          className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all"
        >
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {posts.map(post => (
          <Link
            key={post.id}
            to={`/blog/${post.slug}`}
            className="group surface-premium rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_-12px_hsl(var(--primary)/0.3)]"
          >
            {post.category && (
              <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
                {post.category}
              </span>
            )}
            <h3 className="font-display font-bold text-base mb-2 group-hover:text-primary transition-colors line-clamp-2">
              {post.title}
            </h3>
            {post.excerpt && (
              <p className="text-xs text-muted-foreground line-clamp-3 mb-3 leading-relaxed">
                {post.excerpt}
              </p>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              {post.published_at && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(post.published_at), 'MMM d, yyyy')}
                </span>
              )}
              <span className="text-xs font-semibold text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                Read <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="text-center mt-6 sm:hidden">
        <Link
          to="/blog"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
        >
          View all posts <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
};

export default BlogPreview;
