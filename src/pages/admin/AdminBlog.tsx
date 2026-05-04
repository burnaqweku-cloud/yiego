import { useState } from 'react';
import AdminLayout from './AdminLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, ExternalLink, Eye } from 'lucide-react';
import { format } from 'date-fns';
import SEOHead from '@/components/seo/SEOHead';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  seo_title: string | null;
  meta_description: string | null;
  content: string;
  excerpt: string | null;
  cover_image_url: string | null;
  tags: string[];
  category: string;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const emptyPost: Partial<BlogPost> = {
  title: '', slug: '', seo_title: '', meta_description: '', content: '', excerpt: '',
  cover_image_url: '', tags: [], category: 'general', published: false,
};

const AdminBlog = () => {
  const queryClient = useQueryClient();
  const [editPost, setEditPost] = useState<Partial<BlogPost> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tagsInput, setTagsInput] = useState('');

  const { data: posts, isLoading } = useQuery({
    queryKey: ['admin-blog-posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as BlogPost[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (post: Partial<BlogPost>) => {
      const slug = post.slug || post.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || '';
      const payload = {
        title: post.title || '',
        slug,
        seo_title: post.seo_title || null,
        meta_description: post.meta_description || null,
        content: post.content || '',
        excerpt: post.excerpt || null,
        cover_image_url: post.cover_image_url || null,
        tags: post.tags || [],
        category: post.category || 'general',
        published: post.published || false,
        published_at: post.published ? (post.published_at || new Date().toISOString()) : null,
      };

      if (post.id) {
        const { error } = await supabase.from('blog_posts').update(payload).eq('id', post.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('blog_posts').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blog-posts'] });
      toast.success('Blog post saved');
      setDialogOpen(false);
      setEditPost(null);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('blog_posts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blog-posts'] });
      toast.success('Post deleted');
    },
  });

  const openEdit = (post?: BlogPost) => {
    if (post) {
      setEditPost({ ...post });
      setTagsInput((post.tags || []).join(', '));
    } else {
      setEditPost({ ...emptyPost });
      setTagsInput('');
    }
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!editPost?.title) { toast.error('Title is required'); return; }
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    saveMutation.mutate({ ...editPost, tags });
  };

  return (
    <AdminLayout>
      <SEOHead title="Blog Management | Admin" noIndex />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Blog Posts</h1>
          <p className="text-sm text-muted-foreground">Manage blog posts for SEO content</p>
        </div>
        <Button onClick={() => openEdit()} className="gap-2">
          <Plus className="w-4 h-4" /> New Post
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          (posts || []).map(post => (
            <div key={post.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-sm truncate">{post.title}</h3>
                  {post.published ? (
                    <Badge className="bg-success/10 text-success text-[10px]">Published</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Draft</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">/blog/{post.slug}</p>
                {post.published_at && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {format(new Date(post.published_at), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => window.open(`/blog/${post.slug}`, '_blank')}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(post)}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                  if (confirm('Delete this post?')) deleteMutation.mutate(post.id);
                }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPost?.id ? 'Edit Post' : 'New Post'}</DialogTitle>
          </DialogHeader>
          {editPost && (
            <div className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input value={editPost.title || ''} onChange={e => setEditPost({ ...editPost, title: e.target.value })} />
              </div>
              <div>
                <Label>Slug (URL)</Label>
                <Input
                  value={editPost.slug || ''}
                  onChange={e => setEditPost({ ...editPost, slug: e.target.value })}
                  placeholder="auto-generated-from-title"
                />
              </div>
              <div>
                <Label>SEO Title Override</Label>
                <Input value={editPost.seo_title || ''} onChange={e => setEditPost({ ...editPost, seo_title: e.target.value })} placeholder="Defaults to title" />
              </div>
              <div>
                <Label>Meta Description</Label>
                <Textarea value={editPost.meta_description || ''} onChange={e => setEditPost({ ...editPost, meta_description: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Excerpt</Label>
                <Textarea value={editPost.excerpt || ''} onChange={e => setEditPost({ ...editPost, excerpt: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Cover Image URL</Label>
                <Input value={editPost.cover_image_url || ''} onChange={e => setEditPost({ ...editPost, cover_image_url: e.target.value })} />
              </div>
              <div>
                <Label>Content (Markdown)</Label>
                <Textarea
                  value={editPost.content || ''}
                  onChange={e => setEditPost({ ...editPost, content: e.target.value })}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="MTN, Ghana, data bundles" />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={editPost.category || ''} onChange={e => setEditPost({ ...editPost, category: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editPost.published || false} onCheckedChange={v => setEditPost({ ...editPost, published: v })} />
                <Label>Published</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminBlog;
