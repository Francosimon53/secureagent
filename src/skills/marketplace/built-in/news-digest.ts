import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface Subscription {
  topic: string;
  addedAt: Date;
  frequency: 'daily' | 'weekly';
}

interface NewsState {
  subscriptions: Subscription[];
  savedArticles: Array<{
    title: string;
    source: string;
    topic: string;
    savedAt: Date;
  }>;
}

const state: NewsState = {
  subscriptions: [],
  savedArticles: []
};

const mockNews: Record<string, Array<{ title: string; source: string; time: string }>> = {
  technology: [
    { title: 'AI breakthrough promises faster computing', source: 'TechCrunch', time: '2h ago' },
    { title: 'New smartphone features revolutionary battery', source: 'The Verge', time: '4h ago' },
    { title: 'Cloud computing trends for the next decade', source: 'Wired', time: '6h ago' }
  ],
  business: [
    { title: 'Markets reach new highs amid economic optimism', source: 'Bloomberg', time: '1h ago' },
    { title: 'Startup funding hits record levels in Q4', source: 'Forbes', time: '3h ago' },
    { title: 'Remote work reshaping corporate real estate', source: 'WSJ', time: '5h ago' }
  ],
  science: [
    { title: 'Researchers discover high temperature superconductor', source: 'Nature', time: '2h ago' },
    { title: 'Space telescope captures distant galaxy formation', source: 'NASA', time: '4h ago' },
    { title: 'Climate study reveals acceleration patterns', source: 'Science', time: '8h ago' }
  ],
  general: [
    { title: 'Global leaders meet for climate summit', source: 'Reuters', time: '1h ago' },
    { title: 'Cultural festival draws millions worldwide', source: 'AP News', time: '3h ago' },
    { title: 'New transportation initiative launched', source: 'NPR', time: '5h ago' }
  ]
};

export const newsDigest: BuiltInSkill = {
  id: 'news-digest',
  name: 'News Digest',
  description: 'Stay informed with personalized news digests. Subscribe to topics and get curated updates delivered to you.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '📰',
  category: 'research',
  installCount: 3892,
  rating: 4.6,
  commands: [
    {
      name: 'digest',
      description: 'Get your personalized news digest',
      usage: 'news digest [topic]',
      examples: ['news digest', 'news digest technology']
    },
    {
      name: 'topics',
      description: 'Browse available news topics',
      usage: 'news topics',
      examples: ['news topics']
    },
    {
      name: 'search',
      description: 'Search for specific news',
      usage: 'news search <query>',
      examples: ['news search "artificial intelligence"']
    },
    {
      name: 'subscribe',
      description: 'Subscribe to a topic for regular updates',
      usage: 'news subscribe <topic> [daily|weekly]',
      examples: ['news subscribe technology daily']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'digest': {
        const topic = (params.arg0 as string)?.toLowerCase();
        const now = new Date();
        const timeStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let digestText = '📰 NEWS DIGEST\n';
        digestText += 'Generated: ' + timeStr + '\n\n';

        if (topic && mockNews[topic]) {
          digestText += topic.toUpperCase() + ' NEWS:\n';
          digestText += '━━━━━━━━━━━━━━━━━━━━\n\n';
          
          mockNews[topic].forEach((article, i) => {
            digestText += (i + 1) + '. ' + article.title + '\n';
            digestText += '   ' + article.source + ' • ' + article.time + '\n\n';
          });
        } else {
          const topics = ['technology', 'business', 'science'];
          topics.forEach(t => {
            digestText += t.toUpperCase() + ':\n';
            mockNews[t].slice(0, 2).forEach((article, i) => {
              digestText += '  • ' + article.title + '\n';
              digestText += '    ' + article.source + ' • ' + article.time + '\n';
            });
            digestText += '\n';
          });
        }

        if (state.subscriptions.length > 0) {
          digestText += '━━━━━━━━━━━━━━━━━━━━\n';
          digestText += 'Subscribed topics: ' + state.subscriptions.map(s => s.topic).join(', ');
        }

        return {
          success: true,
          message: digestText
        };
      }

      case 'topics': {
        const availableTopics = Object.keys(mockNews);

        let topicsText = '📑 AVAILABLE NEWS TOPICS\n\n';
        
        availableTopics.forEach(topic => {
          const isSubscribed = state.subscriptions.some(s => s.topic === topic);
          const icon = isSubscribed ? '✓' : '○';
          topicsText += icon + ' ' + topic.charAt(0).toUpperCase() + topic.slice(1) + '\n';
        });

        topicsText += '\nSubscribed: ' + state.subscriptions.length + '/' + availableTopics.length + '\n\n';
        topicsText += 'Use "news subscribe <topic>" to get regular updates.\n';
        topicsText += 'Use "news digest <topic>" to read now.';

        return {
          success: true,
          message: topicsText
        };
      }

      case 'search': {
        const query = Object.values(params).join(' ').replace(/^["']|["']$/g, '');

        if (!query) {
          return {
            success: false,
            message: 'Please provide a search query. Usage: news search <query>'
          };
        }

        let searchResults = '🔍 NEWS SEARCH RESULTS\n\n';
        searchResults += 'Query: "' + query + '"\n\n';
        searchResults += 'RESULTS:\n';
        searchResults += '━━━━━━━━━━━━━━━━━━━━\n\n';

        searchResults += '1. ' + query + ': Latest developments and analysis\n';
        searchResults += '   Reuters • 1h ago\n\n';
        
        searchResults += '2. Expert opinions on ' + query + '\n';
        searchResults += '   Forbes • 3h ago\n\n';
        
        searchResults += '3. How ' + query + ' is changing the industry\n';
        searchResults += '   TechCrunch • 5h ago\n\n';
        
        searchResults += '4. ' + query + ' trends to watch this year\n';
        searchResults += '   Bloomberg • Yesterday\n\n';

        searchResults += 'Showing 4 of 127 results\n';
        searchResults += 'Connect to a news API for comprehensive search.';

        return {
          success: true,
          message: searchResults
        };
      }

      case 'subscribe': {
        const topic = (params.arg0 as string)?.toLowerCase();
        const frequency = ((params.arg1 as string)?.toLowerCase() === 'weekly' ? 'weekly' : 'daily') as 'daily' | 'weekly';

        if (!topic) {
          return {
            success: false,
            message: 'Please specify a topic. Usage: news subscribe <topic> [daily|weekly]'
          };
        }

        const existingIndex = state.subscriptions.findIndex(s => s.topic === topic);
        
        if (existingIndex !== -1) {
          state.subscriptions[existingIndex].frequency = frequency;
          return {
            success: true,
            message: '✅ SUBSCRIPTION UPDATED\n\n' +
              'Topic: ' + topic.charAt(0).toUpperCase() + topic.slice(1) + '\n' +
              'Frequency: ' + frequency + '\n\n' +
              'You will receive ' + frequency + ' digests for this topic.'
          };
        }

        state.subscriptions.push({
          topic,
          addedAt: new Date(),
          frequency
        });

        return {
          success: true,
          message: '✅ SUBSCRIBED\n\n' +
            'Topic: ' + topic.charAt(0).toUpperCase() + topic.slice(1) + '\n' +
            'Frequency: ' + frequency + '\n\n' +
            'Total subscriptions: ' + state.subscriptions.length + '\n\n' +
            'You will now receive ' + frequency + ' news digests on this topic.'
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: digest, topics, search, subscribe'
        };
    }
  }
};

export default newsDigest;
