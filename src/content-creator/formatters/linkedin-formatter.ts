/**
 * Content Creator Suite - LinkedIn Formatter
 *
 * Formats LinkedIn posts and articles for various output formats.
 */

import type { LinkedInPost, LinkedInArticle, GeneratedContent } from '../types.js';
import { CONTENT_DEFAULTS } from '../constants.js';

// =============================================================================
// Types
// =============================================================================

export type LinkedInOutputFormat = 'plain' | 'markdown' | 'html' | 'json';

export interface LinkedInFormatOptions {
  includeMetadata?: boolean;
  includeCharCount?: boolean;
  preserveLineBreaks?: boolean;
  maxPreviewLength?: number;
}

// =============================================================================
// LinkedIn Formatter
// =============================================================================

export class LinkedInFormatter {
  /**
   * Format a LinkedIn post
   */
  formatPost(
    post: LinkedInPost,
    format: LinkedInOutputFormat = 'plain',
    options?: LinkedInFormatOptions
  ): string {
    switch (format) {
      case 'plain':
        return this.formatPostPlain(post, options);
      case 'markdown':
        return this.formatPostMarkdown(post, options);
      case 'html':
        return this.formatPostHtml(post, options);
      case 'json':
        return this.formatPostJson(post, options);
      default:
        return post.content;
    }
  }

  /**
   * Format a LinkedIn article
   */
  formatArticle(
    article: LinkedInArticle,
    format: LinkedInOutputFormat = 'plain',
    options?: LinkedInFormatOptions
  ): string {
    switch (format) {
      case 'plain':
        return this.formatArticlePlain(article, options);
      case 'markdown':
        return this.formatArticleMarkdown(article, options);
      case 'html':
        return this.formatArticleHtml(article, options);
      case 'json':
        return this.formatArticleJson(article, options);
      default:
        return `${article.title}\n\n${article.content}`;
    }
  }

  /**
   * Format post as plain text
   */
  private formatPostPlain(post: LinkedInPost, options?: LinkedInFormatOptions): string {
    let output = post.content;

    if (options?.includeCharCount) {
      const remaining = CONTENT_DEFAULTS.LINKEDIN_POST_MAX_LENGTH - post.characterCount;
      output += `\n\n[${post.characterCount} chars, ${remaining} remaining]`;
    }

    if (options?.includeMetadata) {
      output += `\n\nVisibility: ${post.visibility}`;
      if (post.scheduledAt) {
        output += `\nScheduled: ${new Date(post.scheduledAt).toISOString()}`;
      }
    }

    return output;
  }

  /**
   * Format post as Markdown
   */
  private formatPostMarkdown(post: LinkedInPost, options?: LinkedInFormatOptions): string {
    let content = post.content;

    // Convert hashtags to bold
    content = content.replace(/#(\w+)/g, '**#$1**');

    // Convert mentions to links (LinkedIn doesn't have public profile URLs by username)
    content = content.replace(/@(\w+)/g, '**@$1**');

    // Convert URLs to markdown links
    content = content.replace(
      /(https?:\/\/[^\s]+)/g,
      (url) => `[${this.truncateUrl(url)}](${url})`
    );

    let output = content;

    if (post.articleUrl) {
      output += `\n\n📎 [Read more](${post.articleUrl})`;
    }

    if (post.documentUrl) {
      output += `\n\n📄 [Document](${post.documentUrl})`;
    }

    if (post.pollOptions && post.pollOptions.length > 0) {
      output += '\n\n📊 **Poll:**\n';
      post.pollOptions.forEach((option, i) => {
        output += `- ${option}\n`;
      });
    }

    if (options?.includeMetadata) {
      output += '\n\n---\n';
      output += `*${post.characterCount} characters | Visibility: ${post.visibility}*`;
    }

    return output;
  }

  /**
   * Format post as HTML
   */
  private formatPostHtml(post: LinkedInPost, options?: LinkedInFormatOptions): string {
    let content = this.escapeHtml(post.content);

    // Convert hashtags
    content = content.replace(
      /#(\w+)/g,
      '<span class="hashtag"><strong>#$1</strong></span>'
    );

    // Convert mentions
    content = content.replace(
      /@(\w+)/g,
      '<span class="mention"><strong>@$1</strong></span>'
    );

    // Convert URLs
    content = content.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" class="link" target="_blank" rel="noopener">$1</a>'
    );

    // Convert line breaks
    if (options?.preserveLineBreaks !== false) {
      content = content.replace(/\n/g, '<br>');
    }

    let output = `<div class="linkedin-post">\n`;
    output += `  <div class="post-content">${content}</div>\n`;

    if (post.mediaUrls && post.mediaUrls.length > 0) {
      output += `  <div class="post-media">\n`;
      post.mediaUrls.forEach(url => {
        output += `    <img src="${this.escapeHtml(url)}" alt="Post media" class="media-item">\n`;
      });
      output += `  </div>\n`;
    }

    if (post.articleUrl) {
      output += `  <a href="${this.escapeHtml(post.articleUrl)}" class="article-link" target="_blank">Read more →</a>\n`;
    }

    if (post.pollOptions && post.pollOptions.length > 0) {
      output += `  <div class="poll">\n`;
      output += `    <h4>Poll</h4>\n`;
      output += `    <ul class="poll-options">\n`;
      post.pollOptions.forEach(option => {
        output += `      <li>${this.escapeHtml(option)}</li>\n`;
      });
      output += `    </ul>\n`;
      output += `  </div>\n`;
    }

    if (options?.includeMetadata) {
      output += `  <footer class="post-meta">\n`;
      output += `    <span class="char-count">${post.characterCount} characters</span>\n`;
      output += `    <span class="visibility">${post.visibility}</span>\n`;
      output += `  </footer>\n`;
    }

    output += `</div>`;
    return output;
  }

  /**
   * Format post as JSON
   */
  private formatPostJson(post: LinkedInPost, options?: LinkedInFormatOptions): string {
    const data: Record<string, unknown> = {
      content: post.content,
      characterCount: post.characterCount,
      visibility: post.visibility,
    };

    if (options?.includeMetadata) {
      data.id = post.id;
      data.mediaUrls = post.mediaUrls;
      data.documentUrl = post.documentUrl;
      data.articleUrl = post.articleUrl;
      data.pollOptions = post.pollOptions;
      data.scheduledAt = post.scheduledAt;
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Format article as plain text
   */
  private formatArticlePlain(article: LinkedInArticle, options?: LinkedInFormatOptions): string {
    let output = `${article.title}\n${'='.repeat(article.title.length)}\n\n`;
    output += article.content;

    if (article.tags && article.tags.length > 0) {
      output += `\n\nTags: ${article.tags.join(', ')}`;
    }

    if (options?.includeMetadata) {
      output += `\n\nVisibility: ${article.visibility}`;
    }

    return output;
  }

  /**
   * Format article as Markdown
   */
  private formatArticleMarkdown(article: LinkedInArticle, options?: LinkedInFormatOptions): string {
    let output = `# ${article.title}\n\n`;

    if (article.coverImageUrl) {
      output += `![Cover](${article.coverImageUrl})\n\n`;
    }

    output += article.content;

    if (article.tags && article.tags.length > 0) {
      output += '\n\n---\n\n';
      output += `**Tags:** ${article.tags.map(t => `\`${t}\``).join(' ')}`;
    }

    if (options?.includeMetadata) {
      output += `\n\n*Visibility: ${article.visibility}*`;
    }

    return output;
  }

  /**
   * Format article as HTML
   */
  private formatArticleHtml(article: LinkedInArticle, options?: LinkedInFormatOptions): string {
    let output = `<article class="linkedin-article">\n`;

    if (article.coverImageUrl) {
      output += `  <img src="${this.escapeHtml(article.coverImageUrl)}" alt="Cover" class="article-cover">\n`;
    }

    output += `  <h1 class="article-title">${this.escapeHtml(article.title)}</h1>\n`;

    // Convert markdown-like content to HTML
    let content = this.escapeHtml(article.content);
    content = content.replace(/\n\n/g, '</p><p>');
    content = `<p>${content}</p>`;

    output += `  <div class="article-content">${content}</div>\n`;

    if (article.tags && article.tags.length > 0) {
      output += `  <div class="article-tags">\n`;
      article.tags.forEach(tag => {
        output += `    <span class="tag">${this.escapeHtml(tag)}</span>\n`;
      });
      output += `  </div>\n`;
    }

    if (options?.includeMetadata) {
      output += `  <footer class="article-meta">\n`;
      output += `    <span class="visibility">${article.visibility}</span>\n`;
      output += `  </footer>\n`;
    }

    output += `</article>`;
    return output;
  }

  /**
   * Format article as JSON
   */
  private formatArticleJson(article: LinkedInArticle, options?: LinkedInFormatOptions): string {
    const data: Record<string, unknown> = {
      title: article.title,
      content: article.content,
      visibility: article.visibility,
    };

    if (options?.includeMetadata) {
      data.id = article.id;
      data.coverImageUrl = article.coverImageUrl;
      data.tags = article.tags;
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Create a post preview (first few lines with ellipsis)
   */
  createPreview(content: string, maxLength: number = 150): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Try to cut at a sentence boundary
    const truncated = content.substring(0, maxLength);
    const lastSentence = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    if (lastSentence > maxLength * 0.6) {
      return content.substring(0, lastSentence + 1);
    }

    // Cut at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      return content.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Format content with line breaks for LinkedIn
   * (LinkedIn collapses multiple line breaks)
   */
  formatLineBreaks(content: string): string {
    // LinkedIn shows "see more" after ~3 lines, so format strategically
    const lines = content.split('\n');
    const formattedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        formattedLines.push(line);
      } else if (formattedLines.length > 0) {
        // Add empty line only if there's content before it
        formattedLines.push('');
      }
    }

    // Remove trailing empty lines
    while (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] === '') {
      formattedLines.pop();
    }

    return formattedLines.join('\n');
  }

  /**
   * Add hook line at the beginning (for the "see more" preview)
   */
  addHook(content: string, hook: string): string {
    return `${hook}\n\n${content}`;
  }

  /**
   * Add call to action at the end
   */
  addCTA(content: string, cta: string): string {
    return `${content}\n\n${cta}`;
  }

  /**
   * Convert generated content to LinkedIn post format
   */
  contentToPost(content: GeneratedContent): LinkedInPost {
    return {
      id: content.id,
      content: content.content,
      characterCount: content.metadata.characterCount,
      visibility: 'public',
      mediaUrls: content.metadata.mediaUrls,
      scheduledAt: content.scheduledAt,
    };
  }

  /**
   * Optimize post for engagement
   */
  optimizeForEngagement(post: LinkedInPost): LinkedInPost {
    let content = post.content;

    // Ensure there's a hook in the first line
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim() ?? '';

    // If first line is too long, it won't be visible in preview
    if (firstLine.length > 150) {
      // Try to find a natural break point
      const hookEnd = Math.min(
        firstLine.indexOf('.') > 0 ? firstLine.indexOf('.') + 1 : 150,
        firstLine.indexOf('!') > 0 ? firstLine.indexOf('!') + 1 : 150,
        firstLine.indexOf('?') > 0 ? firstLine.indexOf('?') + 1 : 150
      );

      const hook = firstLine.substring(0, hookEnd);
      const rest = firstLine.substring(hookEnd).trim();

      if (rest) {
        lines[0] = hook;
        lines.splice(1, 0, '', rest);
        content = lines.join('\n');
      }
    }

    // Ensure post ends with engagement driver
    const lastLine = content.trim().split('\n').pop()?.trim() ?? '';
    if (!lastLine.includes('?') && !lastLine.includes('👇') && !lastLine.includes('💭')) {
      // Add a subtle engagement prompt
      content = content.trim() + '\n\nThoughts? 💭';
    }

    return {
      ...post,
      content,
      characterCount: content.length,
    };
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
   * Truncate URL for display
   */
  private truncateUrl(url: string, maxLength: number = 40): string {
    if (url.length <= maxLength) return url;

    try {
      const parsed = new URL(url);
      return parsed.hostname + '/...';
    } catch {
      return url.substring(0, maxLength - 3) + '...';
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createLinkedInFormatter(): LinkedInFormatter {
  return new LinkedInFormatter();
}
