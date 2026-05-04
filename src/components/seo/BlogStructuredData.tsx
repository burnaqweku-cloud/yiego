import { useEffect } from 'react';

interface BlogPost {
  title: string;
  slug: string;
  excerpt?: string | null;
  meta_description?: string | null;
  cover_image_url?: string | null;
  published_at?: string | null;
  updated_at?: string;
}

const BlogStructuredData = ({ post }: { post: BlogPost }) => {
  useEffect(() => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.meta_description || post.excerpt || '',
      url: `https://yiego.com/blog/${post.slug}`,
      image: post.cover_image_url || 'https://yiego.com/og-image.png',
      datePublished: post.published_at || undefined,
      dateModified: post.updated_at || post.published_at || undefined,
      author: {
        '@type': 'Organization',
        name: 'YieGo',
        url: 'https://yiego.com',
      },
      publisher: {
        '@type': 'Organization',
        name: 'YieGo',
        logo: { '@type': 'ImageObject', url: 'https://yiego.com/yiego-logo.png' },
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `https://yiego.com/blog/${post.slug}`,
      },
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'article-schema';
    document.getElementById('article-schema')?.remove();
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);

    return () => { script.remove(); };
  }, [post]);

  return null;
};

export default BlogStructuredData;
