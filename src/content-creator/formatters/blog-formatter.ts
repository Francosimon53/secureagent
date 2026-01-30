/**
 * Content Creator Suite - Blog Formatter
 *
 * Formats blog posts for various output formats and platforms.
 */

import type { BlogPost, GeneratedContent, BlogSEO } from '../types.js';
import { CONTENT_DEFAULTS } from '../constants.js';

// =============================================================================
// Types
// =============================================================================

export type BlogOutputFormat = 'markdown' | 'html' | 'plain' | 'json' | 'rss';

export interface BlogFormatOptions {
  includeMetadata?: boolean;
  includeSEO?: boolean;
  includeTOC?: boolean;
  includeReadingTime?: boolean;
  includeWordCount?: boolean;
  excerptLength?: number;
  dateFormat?: 'iso' | 'locale' | 'relative';
  platform?: 'wordpress' | 'ghost' | 'bearblog' | 'medium';
}

export interface TableOfContentsItem {
  level: number;
  text: string;
  slug: string;
}

// =============================================================================
// Blog Formatter
// =============================================================================

export class BlogFormatter {
  /**
   * Format a blog post
   */
  formatPost(
    post: BlogPost,
    format: BlogOutputFormat = 'markdown',
    options?: BlogFormatOptions
  ): string {
    switch (format) {
      case 'markdown':
        return this.formatAsMarkdown(post, options);
      case 'html':
        return this.formatAsHtml(post, options);
      case 'plain':
        return this.formatAsPlain(post, options);
      case 'json':
        return this.formatAsJson(post, options);
      case 'rss':
        return this.formatAsRss(post, options);
      default:
        return post.content;
    }
  }

  /**
   * Format as Markdown
   */
  private formatAsMarkdown(post: BlogPost, options?: BlogFormatOptions): string {
    const lines: string[] = [];

    // Front matter
    if (options?.includeMetadata) {
      lines.push('---');
      lines.push(`title: "${this.escapeYaml(post.title)}"`);
      if (post.slug) lines.push(`slug: "${post.slug}"`);
      if (post.author) lines.push(`author: "${post.author}"`);
      if (post.publishedAt) {
        lines.push(`date: "${this.formatDate(post.publishedAt, options.dateFormat)}"`);
      }
      if (post.tags && post.tags.length > 0) {
        lines.push(`tags: [${post.tags.map(t => `"${t}"`).join(', ')}]`);
      }
      if (post.categories && post.categories.length > 0) {
        lines.push(`categories: [${post.categories.map(c => `"${c}"`).join(', ')}]`);
      }
      if (post.coverImageUrl) {
        lines.push(`coverImage: "${post.coverImageUrl}"`);
      }
      if (options.includeSEO && post.seo) {
        if (post.seo.metaTitle) lines.push(`metaTitle: "${this.escapeYaml(post.seo.metaTitle)}"`);
        if (post.seo.metaDescription) lines.push(`metaDescription: "${this.escapeYaml(post.seo.metaDescription)}"`);
        if (post.seo.focusKeyword) lines.push(`focusKeyword: "${post.seo.focusKeyword}"`);
      }
      lines.push('---');
      lines.push('');
    }

    // Title
    lines.push(`# ${post.title}`);
    lines.push('');

    // Meta info
    if (options?.includeReadingTime || options?.includeWordCount) {
      const metaItems: string[] = [];
      if (options.includeReadingTime) {
        const readingTime = this.estimateReadingTime(post.content);
        metaItems.push(`${readingTime} min read`);
      }
      if (options.includeWordCount) {
        const wordCount = this.countWords(post.content);
        metaItems.push(`${wordCount} words`);
      }
      lines.push(`*${metaItems.join(' | ')}*`);
      lines.push('');
    }

    // Cover image
    if (post.coverImageUrl) {
      lines.push(`![Cover Image](${post.coverImageUrl})`);
      lines.push('');
    }

    // Excerpt
    if (post.excerpt) {
      lines.push(`> ${post.excerpt}`);
      lines.push('');
    }

    // Table of contents
    if (options?.includeTOC) {
      const toc = this.generateTableOfContents(post.content);
      if (toc.length > 0) {
        lines.push('## Table of Contents');
        lines.push('');
        for (const item of toc) {
          const indent = '  '.repeat(item.level - 2);
          lines.push(`${indent}- [${item.text}](#${item.slug})`);
        }
        lines.push('');
      }
    }

    // Content
    const mdContent = this.htmlToMarkdown(post.content);
    lines.push(mdContent);

    // Tags at end
    if (post.tags && post.tags.length > 0 && options?.includeMetadata) {
      lines.push('');
      lines.push('---');
      lines.push(`**Tags:** ${post.tags.map(t => `#${t}`).join(' ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Format as HTML
   */
  private formatAsHtml(post: BlogPost, options?: BlogFormatOptions): string {
    const parts: string[] = [];

    parts.push('<!DOCTYPE html>');
    parts.push('<html>');
    parts.push('<head>');
    parts.push(`  <meta charset="utf-8">`);
    parts.push(`  <title>${this.escapeHtml(post.title)}</title>`);

    // SEO meta tags
    if (options?.includeSEO && post.seo) {
      if (post.seo.metaDescription) {
        parts.push(`  <meta name="description" content="${this.escapeHtml(post.seo.metaDescription)}">`);
      }
      if (post.seo.focusKeyword) {
        parts.push(`  <meta name="keywords" content="${this.escapeHtml(post.seo.focusKeyword)}">`);
      }
      if (post.seo.canonicalUrl) {
        parts.push(`  <link rel="canonical" href="${post.seo.canonicalUrl}">`);
      }
      if (post.seo.ogTitle) {
        parts.push(`  <meta property="og:title" content="${this.escapeHtml(post.seo.ogTitle)}">`);
      }
      if (post.seo.ogDescription) {
        parts.push(`  <meta property="og:description" content="${this.escapeHtml(post.seo.ogDescription)}">`);
      }
      if (post.seo.ogImage) {
        parts.push(`  <meta property="og:image" content="${post.seo.ogImage}">`);
      }
    }

    parts.push('</head>');
    parts.push('<body>');
    parts.push('<article class="blog-post">');

    // Header
    parts.push('  <header>');
    parts.push(`    <h1 class="post-title">${this.escapeHtml(post.title)}</h1>`);

    if (options?.includeMetadata) {
      parts.push('    <div class="post-meta">');
      if (post.author) {
        parts.push(`      <span class="author">By ${this.escapeHtml(post.author)}</span>`);
      }
      if (post.publishedAt) {
        const dateStr = this.formatDate(post.publishedAt, options.dateFormat);
        parts.push(`      <time datetime="${new Date(post.publishedAt).toISOString()}">${dateStr}</time>`);
      }
      if (options.includeReadingTime) {
        const readingTime = this.estimateReadingTime(post.content);
        parts.push(`      <span class="reading-time">${readingTime} min read</span>`);
      }
      parts.push('    </div>');
    }

    parts.push('  </header>');

    // Cover image
    if (post.coverImageUrl) {
      parts.push(`  <figure class="cover-image">`);
      parts.push(`    <img src="${post.coverImageUrl}" alt="${this.escapeHtml(post.title)}">`);
      parts.push(`  </figure>`);
    }

    // Excerpt
    if (post.excerpt) {
      parts.push(`  <p class="excerpt">${this.escapeHtml(post.excerpt)}</p>`);
    }

    // Table of contents
    if (options?.includeTOC) {
      const toc = this.generateTableOfContents(post.content);
      if (toc.length > 0) {
        parts.push('  <nav class="table-of-contents">');
        parts.push('    <h2>Table of Contents</h2>');
        parts.push('    <ul>');
        for (const item of toc) {
          parts.push(`      <li class="toc-level-${item.level}"><a href="#${item.slug}">${this.escapeHtml(item.text)}</a></li>`);
        }
        parts.push('    </ul>');
        parts.push('  </nav>');
      }
    }

    // Content
    parts.push('  <div class="post-content">');
    parts.push(`    ${post.content}`);
    parts.push('  </div>');

    // Tags
    if (post.tags && post.tags.length > 0) {
      parts.push('  <footer class="post-tags">');
      for (const tag of post.tags) {
        parts.push(`    <span class="tag">${this.escapeHtml(tag)}</span>`);
      }
      parts.push('  </footer>');
    }

    parts.push('</article>');
    parts.push('</body>');
    parts.push('</html>');

    return parts.join('\n');
  }

  /**
   * Format as plain text
   */
  private formatAsPlain(post: BlogPost, options?: BlogFormatOptions): string {
    const lines: string[] = [];

    // Title
    lines.push(post.title);
    lines.push('='.repeat(post.title.length));
    lines.push('');

    // Meta
    if (options?.includeMetadata) {
      if (post.author) lines.push(`Author: ${post.author}`);
      if (post.publishedAt) {
        lines.push(`Date: ${this.formatDate(post.publishedAt, options.dateFormat)}`);
      }
      if (options.includeReadingTime) {
        lines.push(`Reading time: ${this.estimateReadingTime(post.content)} min`);
      }
      lines.push('');
    }

    // Excerpt
    if (post.excerpt) {
      lines.push(post.excerpt);
      lines.push('');
    }

    // Content
    const plainContent = this.stripHtml(post.content);
    lines.push(plainContent);

    // Tags
    if (post.tags && post.tags.length > 0) {
      lines.push('');
      lines.push(`Tags: ${post.tags.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Format as JSON
   */
  private formatAsJson(post: BlogPost, options?: BlogFormatOptions): string {
    const data: Record<string, unknown> = {
      title: post.title,
      slug: post.slug,
      content: post.content,
      status: post.status,
      platform: post.platform,
    };

    if (options?.includeMetadata) {
      data.id = post.id;
      data.author = post.author;
      data.excerpt = post.excerpt;
      data.coverImageUrl = post.coverImageUrl;
      data.tags = post.tags;
      data.categories = post.categories;
      data.publishedAt = post.publishedAt;
      data.createdAt = post.createdAt;
      data.updatedAt = post.updatedAt;
    }

    if (options?.includeSEO && post.seo) {
      data.seo = post.seo;
    }

    if (options?.includeWordCount) {
      data.wordCount = this.countWords(post.content);
    }

    if (options?.includeReadingTime) {
      data.readingTime = this.estimateReadingTime(post.content);
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Format as RSS item
   */
  private formatAsRss(post: BlogPost, options?: BlogFormatOptions): string {
    const pubDate = post.publishedAt
      ? new Date(post.publishedAt).toUTCString()
      : new Date().toUTCString();

    const description = post.excerpt ?? this.generateExcerpt(post.content, options?.excerptLength);

    return `<item>
  <title><![CDATA[${post.title}]]></title>
  <link>${post.seo?.canonicalUrl ?? ''}</link>
  <guid isPermaLink="true">${post.seo?.canonicalUrl ?? post.slug ?? post.id}</guid>
  <pubDate>${pubDate}</pubDate>
  <description><![CDATA[${description}]]></description>
  <content:encoded><![CDATA[${post.content}]]></content:encoded>
  ${post.author ? `<dc:creator><![CDATA[${post.author}]]></dc:creator>` : ''}
  ${post.categories?.map(c => `<category><![CDATA[${c}]]></category>`).join('\n  ') ?? ''}
</item>`;
  }

  // ===========================================================================
  // Conversion Methods
  // ===========================================================================

  /**
   * Convert generated content to blog post
   */
  contentToBlogPost(content: GeneratedContent, seo?: BlogSEO): BlogPost {
    return {
      id: content.id,
      title: content.title ?? 'Untitled',
      content: content.content,
      excerpt: this.generateExcerpt(content.content),
      status: content.status === 'published' ? 'published' : 'draft',
      platform: content.platform,
      tags: content.metadata.hashtags,
      seo,
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
    };
  }

  /**
   * Generate excerpt from content
   */
  generateExcerpt(content: string, maxLength: number = CONTENT_DEFAULTS.BLOG_EXCERPT_LENGTH): string {
    const plainText = this.stripHtml(content);
    if (plainText.length <= maxLength) {
      return plainText;
    }

    // Try to cut at a sentence boundary
    const truncated = plainText.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    if (lastSentenceEnd > maxLength * 0.7) {
      return truncated.substring(0, lastSentenceEnd + 1);
    }

    // Cut at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Generate slug from title
   */
  generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, CONTENT_DEFAULTS.BLOG_SLUG_MAX_LENGTH);
  }

  /**
   * Generate table of contents
   */
  generateTableOfContents(content: string): TableOfContentsItem[] {
    const headingRegex = /<h([2-6])[^>]*(?:id=["']([^"']+)["'])?[^>]*>(.*?)<\/h\1>/gi;
    const toc: TableOfContentsItem[] = [];

    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      const level = parseInt(match[1], 10);
      const existingId = match[2];
      const text = this.stripHtml(match[3]);
      const slug = existingId || this.generateSlug(text);

      toc.push({ level, text, slug });
    }

    return toc;
  }

  /**
   * Convert HTML to Markdown
   */
  htmlToMarkdown(html: string): string {
    let md = html;

    // Headers
    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
    md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

    // Bold and italic
    md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

    // Links
    md = md.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // Images
    md = md.replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, '![$2]($1)');
    md = md.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*\/?>/gi, '![$1]($2)');
    md = md.replace(/<img[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, '![]($1)');

    // Lists
    md = md.replace(/<ul[^>]*>/gi, '\n');
    md = md.replace(/<\/ul>/gi, '\n');
    md = md.replace(/<ol[^>]*>/gi, '\n');
    md = md.replace(/<\/ol>/gi, '\n');
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

    // Paragraphs
    md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

    // Line breaks
    md = md.replace(/<br\s*\/?>/gi, '\n');

    // Blockquotes
    md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_, content) => {
      return content.split('\n').map((line: string) => `> ${line.trim()}`).join('\n') + '\n\n';
    });

    // Code
    md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n\n');

    // Remove remaining HTML tags
    md = md.replace(/<[^>]+>/g, '');

    // Clean up whitespace
    md = md.replace(/\n{3,}/g, '\n\n');
    md = md.trim();

    return md;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Strip HTML tags
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Escape YAML special characters
   */
  private escapeYaml(text: string): string {
    return text.replace(/"/g, '\\"');
  }

  /**
   * Format date
   */
  private formatDate(timestamp: number, format?: 'iso' | 'locale' | 'relative'): string {
    const date = new Date(timestamp);

    switch (format) {
      case 'iso':
        return date.toISOString();
      case 'relative':
        return this.getRelativeTime(timestamp);
      case 'locale':
      default:
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
    }
  }

  /**
   * Get relative time string
   */
  private getRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  }

  /**
   * Count words in content
   */
  private countWords(content: string): number {
    const text = this.stripHtml(content);
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Estimate reading time
   */
  private estimateReadingTime(content: string, wordsPerMinute: number = 200): number {
    const wordCount = this.countWords(content);
    return Math.ceil(wordCount / wordsPerMinute);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createBlogFormatter(): BlogFormatter {
  return new BlogFormatter();
}
