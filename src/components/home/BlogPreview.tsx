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
    <section className="container py-16 md:py-20 max-w-6xl">
      <div className="flex items-end justify-between mb-10">
        <div>
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">From the Blog</span>
          </div>
          <h2 className="text-2xl md:text-[2rem] font-display font-extrabold tracking-[-0.025em] leading-[1.1]">
            Insights, tips & <span className="text-gradient">guides</span>
          </h2>
        </div>
        <Link
          to="/blog"
          className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-border bg-card/60 backdrop-blur-sm text-sm font-semibold text-foreground/80 hover:text-primary hover:border-primary/40 hover:gap-2.5 transition-all"
        >
          View all <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {posts.map(post => (
          <Link
            key={post.id}
            to={`/blog/${post.slug}`}
            className="group relative surface-premium rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.35)] overflow-hidden"
          >
            {/* Top sheen on hover */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            {post.category && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary mb-3 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                {post.category}
              </span>
            )}
            <h3 className="font-display font-bold text-[15.5px] tracking-tight mb-2 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
              {post.title}
            </h3>
            {post.excerpt && (
              <p className="text-xs text-muted-foreground line-clamp-3 mb-4 leading-relaxed">
                {post.excerpt}
              </p>
            )}
            <div className="flex items-center justify-between pt-3 border-t border-border/40">
              {post.published_at && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(post.published_at), 'MMM d, yyyy')}
                </span>
              )}
              <span className="text-xs font-semibold text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
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
