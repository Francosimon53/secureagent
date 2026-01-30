/**
 * Sentiment Providers Index
 *
 * Re-exports all sentiment provider implementations.
 */

export {
  TwitterSentimentProvider,
  createTwitterSentimentProvider,
  type TwitterSentimentConfig,
} from './twitter-sentiment.js';

export {
  RedditSentimentProvider,
  createRedditSentimentProvider,
  type RedditSentimentConfig,
} from './reddit-sentiment.js';

export {
  NewsSentimentProvider,
  createNewsSentimentProvider,
  type NewsSentimentConfig,
} from './news-sentiment.js';
