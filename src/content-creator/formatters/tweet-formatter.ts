/**
 * Content Creator Suite - Tweet Formatter
 *
 * Formats tweets and threads for various output formats.
 */

import type { Tweet, Thread, GeneratedContent } from '../types.js';
import { CONTENT_DEFAULTS } from '../constants.js';

// =============================================================================
// Types
// =============================================================================

export type TweetOutputFormat = 'plain' | 'markdown' | 'html' | 'json';

export interface FormatOptions {
  includeMetadata?: boolean;
  includeNumbering?: boolean;
  includeCharCount?: boolean;
  preserveLineBreaks?: boolean;
}

// =============================================================================
// Tweet Formatter
// =============================================================================

export class TweetFormatter {
  /**
   * Format a single tweet
   */
  formatTweet(tweet: Tweet, format: TweetOutputFormat = 'plain', options?: FormatOptions): string {
    switch (format) {
      case 'plain':
        return this.formatTweetPlain(tweet, options);
      case 'markdown':
        return this.formatTweetMarkdown(tweet, options);
      case 'html':
        return this.formatTweetHtml(tweet, options);
      case 'json':
        return this.formatTweetJson(tweet, options);
      default:
        return tweet.content;
    }
  }

  /**
   * Format a thread
   */
  formatThread(thread: Thread, format: TweetOutputFormat = 'plain', options?: FormatOptions): string {
    switch (format) {
      case 'plain':
        return this.formatThreadPlain(thread, options);
      case 'markdown':
        return this.formatThreadMarkdown(thread, options);
      case 'html':
        return this.formatThreadHtml(thread, options);
      case 'json':
        return this.formatThreadJson(thread, options);
      default:
        return thread.tweets.map(t => t.content).join('\n\n');
    }
  }

  /**
   * Format tweet as plain text
   */
  private formatTweetPlain(tweet: Tweet, options?: FormatOptions): string {
    let output = tweet.content;

    if (options?.includeCharCount) {
      const remaining = CONTENT_DEFAULTS.TWEET_MAX_LENGTH - tweet.characterCount;
      output += `\n\n[${tweet.characterCount} chars, ${remaining} remaining]`;
    }

    return output;
  }

  /**
   * Format tweet as Markdown
   */
  private formatTweetMarkdown(tweet: Tweet, options?: FormatOptions): string {
    let content = tweet.content;

    // Convert hashtags to links
    content = content.replace(/#(\w+)/g, '[#$1](https://twitter.com/hashtag/$1)');

    // Convert mentions to links
    content = content.replace(/@(\w+)/g, '[@$1](https://twitter.com/$1)');

    // Convert URLs to markdown links
    content = content.replace(
      /(https?:\/\/[^\s]+)/g,
      (url) => `[${this.truncateUrl(url)}](${url})`
    );

    let output = content;

    if (options?.includeMetadata) {
      output += '\n\n---\n';
      output += `*${tweet.characterCount} characters*`;
      if (tweet.scheduledAt) {
        output += ` | Scheduled: ${new Date(tweet.scheduledAt).toISOString()}`;
      }
    }

    return output;
  }

  /**
   * Format tweet as HTML
   */
  private formatTweetHtml(tweet: Tweet, options?: FormatOptions): string {
    let content = this.escapeHtml(tweet.content);

    // Convert hashtags to links
    content = content.replace(
      /#(\w+)/g,
      '<a href="https://twitter.com/hashtag/$1" class="hashtag">#$1</a>'
    );

    // Convert mentions to links
    content = content.replace(
      /@(\w+)/g,
      '<a href="https://twitter.com/$1" class="mention">@$1</a>'
    );

    // Convert URLs to links
    content = content.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" class="link" target="_blank" rel="noopener">$1</a>'
    );

    // Convert line breaks
    if (options?.preserveLineBreaks !== false) {
      content = content.replace(/\n/g, '<br>');
    }

    let output = `<div class="tweet">\n  <p class="tweet-content">${content}</p>`;

    if (options?.includeMetadata) {
      output += `\n  <footer class="tweet-meta">`;
      output += `\n    <span class="char-count">${tweet.characterCount} characters</span>`;
      if (tweet.scheduledAt) {
        output += `\n    <span class="scheduled">Scheduled: ${new Date(tweet.scheduledAt).toISOString()}</span>`;
      }
      output += `\n  </footer>`;
    }

    output += '\n</div>';
    return output;
  }

  /**
   * Format tweet as JSON
   */
  private formatTweetJson(tweet: Tweet, options?: FormatOptions): string {
    const data: Record<string, unknown> = {
      content: tweet.content,
      characterCount: tweet.characterCount,
    };

    if (options?.includeMetadata) {
      data.id = tweet.id;
      data.mediaUrls = tweet.mediaUrls;
      data.quoteTweetId = tweet.quoteTweetId;
      data.replyToId = tweet.replyToId;
      data.scheduledAt = tweet.scheduledAt;
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Format thread as plain text
   */
  private formatThreadPlain(thread: Thread, options?: FormatOptions): string {
    const includeNumbers = options?.includeNumbering !== false;
    const total = thread.tweets.length;

    const tweets = thread.tweets.map((tweet, index) => {
      const number = includeNumbers ? `${index + 1}/${total} ` : '';
      return `${number}${tweet.content}`;
    });

    let output = tweets.join('\n\n---\n\n');

    if (options?.includeMetadata) {
      output += '\n\n===\n';
      output += `Topic: ${thread.topic}\n`;
      output += `Total tweets: ${thread.tweets.length}\n`;
      output += `Total characters: ${thread.totalCharacters}\n`;
      output += `Estimated read time: ${thread.estimatedReadTime} min`;
    }

    return output;
  }

  /**
   * Format thread as Markdown
   */
  private formatThreadMarkdown(thread: Thread, options?: FormatOptions): string {
    const includeNumbers = options?.includeNumbering !== false;
    const total = thread.tweets.length;

    let output = `# ${thread.topic}\n\n`;

    thread.tweets.forEach((tweet, index) => {
      const number = includeNumbers ? `**${index + 1}/${total}**\n\n` : '';
      let content = tweet.content;

      // Convert hashtags and mentions
      content = content.replace(/#(\w+)/g, '[#$1](https://twitter.com/hashtag/$1)');
      content = content.replace(/@(\w+)/g, '[@$1](https://twitter.com/$1)');

      output += number + content + '\n\n---\n\n';
    });

    if (options?.includeMetadata) {
      output += '\n## Thread Info\n\n';
      output += `- **Total tweets:** ${thread.tweets.length}\n`;
      output += `- **Total characters:** ${thread.totalCharacters}\n`;
      output += `- **Estimated read time:** ${thread.estimatedReadTime} min\n`;
    }

    return output;
  }

  /**
   * Format thread as HTML
   */
  private formatThreadHtml(thread: Thread, options?: FormatOptions): string {
    const includeNumbers = options?.includeNumbering !== false;
    const total = thread.tweets.length;

    let output = `<article class="twitter-thread">\n`;
    output += `  <h1 class="thread-topic">${this.escapeHtml(thread.topic)}</h1>\n`;
    output += `  <div class="thread-tweets">\n`;

    thread.tweets.forEach((tweet, index) => {
      let content = this.escapeHtml(tweet.content);

      // Convert hashtags and mentions
      content = content.replace(
        /#(\w+)/g,
        '<a href="https://twitter.com/hashtag/$1" class="hashtag">#$1</a>'
      );
      content = content.replace(
        /@(\w+)/g,
        '<a href="https://twitter.com/$1" class="mention">@$1</a>'
      );

      // Convert line breaks
      if (options?.preserveLineBreaks !== false) {
        content = content.replace(/\n/g, '<br>');
      }

      output += `    <div class="tweet" data-index="${index + 1}">\n`;
      if (includeNumbers) {
        output += `      <span class="tweet-number">${index + 1}/${total}</span>\n`;
      }
      output += `      <p class="tweet-content">${content}</p>\n`;
      output += `    </div>\n`;
    });

    output += `  </div>\n`;

    if (options?.includeMetadata) {
      output += `  <footer class="thread-meta">\n`;
      output += `    <span class="total-tweets">${thread.tweets.length} tweets</span>\n`;
      output += `    <span class="total-chars">${thread.totalCharacters} characters</span>\n`;
      output += `    <span class="read-time">${thread.estimatedReadTime} min read</span>\n`;
      output += `  </footer>\n`;
    }

    output += `</article>`;
    return output;
  }

  /**
   * Format thread as JSON
   */
  private formatThreadJson(thread: Thread, options?: FormatOptions): string {
    const data: Record<string, unknown> = {
      id: thread.id,
      topic: thread.topic,
      hook: thread.hook,
      totalCharacters: thread.totalCharacters,
      estimatedReadTime: thread.estimatedReadTime,
      tweets: thread.tweets.map((tweet, index) => ({
        index: index + 1,
        content: tweet.content,
        characterCount: tweet.characterCount,
        ...(options?.includeMetadata
          ? {
              id: tweet.id,
              mediaUrls: tweet.mediaUrls,
            }
          : {}),
      })),
    };

    if (options?.includeMetadata) {
      data.callToAction = thread.callToAction;
    }

    return JSON.stringify(data, null, 2);
  }

  /**
   * Convert generated content to tweet format
   */
  contentToTweet(content: GeneratedContent): Tweet {
    return {
      id: content.id,
      content: content.content,
      characterCount: content.metadata.characterCount,
      mediaUrls: content.metadata.mediaUrls,
      scheduledAt: content.scheduledAt,
    };
  }

  /**
   * Parse a text into tweets (for thread creation)
   */
  parseIntoTweets(text: string, maxLength: number = CONTENT_DEFAULTS.TWEET_MAX_LENGTH): Tweet[] {
    const tweets: Tweet[] = [];
    const paragraphs = text.split(/\n\n+/);

    let currentTweet = '';

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      // If adding this paragraph would exceed limit, save current and start new
      const combined = currentTweet ? `${currentTweet}\n\n${trimmed}` : trimmed;

      if (combined.length > maxLength) {
        if (currentTweet) {
          tweets.push({
            content: currentTweet,
            characterCount: currentTweet.length,
          });
        }

        // If single paragraph exceeds limit, split by sentences
        if (trimmed.length > maxLength) {
          const sentenceTweets = this.splitBySentences(trimmed, maxLength);
          tweets.push(...sentenceTweets);
          currentTweet = '';
        } else {
          currentTweet = trimmed;
        }
      } else {
        currentTweet = combined;
      }
    }

    if (currentTweet) {
      tweets.push({
        content: currentTweet,
        characterCount: currentTweet.length,
      });
    }

    return tweets;
  }

  /**
   * Split text by sentences
   */
  private splitBySentences(text: string, maxLength: number): Tweet[] {
    const tweets: Tweet[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentTweet = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      const combined = currentTweet ? `${currentTweet} ${trimmed}` : trimmed;

      if (combined.length > maxLength) {
        if (currentTweet) {
          tweets.push({
            content: currentTweet,
            characterCount: currentTweet.length,
          });
        }

        // If single sentence exceeds limit, truncate with ellipsis
        if (trimmed.length > maxLength) {
          const truncated = trimmed.substring(0, maxLength - 3) + '...';
          tweets.push({
            content: truncated,
            characterCount: truncated.length,
          });
          currentTweet = '';
        } else {
          currentTweet = trimmed;
        }
      } else {
        currentTweet = combined;
      }
    }

    if (currentTweet) {
      tweets.push({
        content: currentTweet,
        characterCount: currentTweet.length,
      });
    }

    return tweets;
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
  private truncateUrl(url: string, maxLength: number = 30): string {
    if (url.length <= maxLength) return url;

    try {
      const parsed = new URL(url);
      const domain = parsed.hostname;
      const path = parsed.pathname;

      if (domain.length > maxLength - 3) {
        return domain.substring(0, maxLength - 3) + '...';
      }

      const availableForPath = maxLength - domain.length - 3;
      if (availableForPath <= 0) {
        return domain + '...';
      }

      return domain + path.substring(0, availableForPath) + '...';
    } catch {
      return url.substring(0, maxLength - 3) + '...';
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTweetFormatter(): TweetFormatter {
  return new TweetFormatter();
}
