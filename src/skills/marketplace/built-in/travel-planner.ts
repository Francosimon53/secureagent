import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface Destination {
  name: string;
  country: string;
  bestTime: string;
  highlights: string[];
  avgCostPerDay: number;
  currency: string;
}

interface TripState {
  savedTrips: Array<{
    destination: string;
    dates: string;
    budget: number;
    notes: string;
    createdAt: Date;
  }>;
  packingLists: Record<string, string[]>;
}

const state: TripState = {
  savedTrips: [],
  packingLists: {}
};

const destinations: Record<string, Destination> = {
  tokyo: {
    name: 'Tokyo',
    country: 'Japan',
    bestTime: 'March-May (cherry blossoms) or Oct-Nov (autumn)',
    highlights: ['Shibuya Crossing', 'Senso-ji Temple', 'Tsukiji Market', 'Harajuku', 'Tokyo Skytree'],
    avgCostPerDay: 150,
    currency: 'JPY'
  },
  paris: {
    name: 'Paris',
    country: 'France',
    bestTime: 'April-June or September-October',
    highlights: ['Eiffel Tower', 'Louvre Museum', 'Notre-Dame', 'Champs-Elysees', 'Montmartre'],
    avgCostPerDay: 200,
    currency: 'EUR'
  },
  bali: {
    name: 'Bali',
    country: 'Indonesia',
    bestTime: 'April-October (dry season)',
    highlights: ['Ubud Rice Terraces', 'Tanah Lot Temple', 'Seminyak Beach', 'Mount Batur', 'Uluwatu'],
    avgCostPerDay: 75,
    currency: 'IDR'
  },
  newyork: {
    name: 'New York City',
    country: 'USA',
    bestTime: 'April-June or September-November',
    highlights: ['Central Park', 'Statue of Liberty', 'Times Square', 'Brooklyn Bridge', 'Museums'],
    avgCostPerDay: 250,
    currency: 'USD'
  },
  barcelona: {
    name: 'Barcelona',
    country: 'Spain',
    bestTime: 'May-June or September-October',
    highlights: ['Sagrada Familia', 'Park Guell', 'La Rambla', 'Gothic Quarter', 'Beaches'],
    avgCostPerDay: 120,
    currency: 'EUR'
  }
};

const packingEssentials: Record<string, string[]> = {
  beach: ['Swimsuit', 'Sunscreen SPF 50', 'Sunglasses', 'Beach towel', 'Flip flops', 'Cover-up', 'Waterproof phone case'],
  city: ['Comfortable walking shoes', 'Day backpack', 'Portable charger', 'Travel adapter', 'Light jacket', 'Umbrella'],
  adventure: ['Hiking boots', 'Quick-dry clothes', 'First aid kit', 'Headlamp', 'Water bottle', 'Rain gear'],
  business: ['Business attire', 'Laptop', 'Business cards', 'Dress shoes', 'Portfolio', 'Professional accessories'],
  general: ['Passport', 'Travel insurance docs', 'Medications', 'Toiletries', 'Phone charger', 'Copies of documents']
};

export const travelPlanner: BuiltInSkill = {
  id: 'travel-planner',
  name: 'Travel Planner',
  description: 'Plan your perfect trip. Get destination info, packing lists, budget estimates, and travel tips.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '✈️',
  category: 'personal',
  installCount: 3234,
  rating: 4.5,
  commands: [
    {
      name: 'destination',
      description: 'Get information about a destination',
      usage: 'travel destination <place>',
      examples: ['travel destination tokyo', 'travel destination "new york"']
    },
    {
      name: 'itinerary',
      description: 'Generate a trip itinerary',
      usage: 'travel itinerary <destination> <days>',
      examples: ['travel itinerary paris 5', 'travel itinerary bali 7']
    },
    {
      name: 'packing',
      description: 'Get a packing list',
      usage: 'travel packing <trip-type>',
      examples: ['travel packing beach', 'travel packing city']
    },
    {
      name: 'budget',
      description: 'Estimate trip budget',
      usage: 'travel budget <destination> <days>',
      examples: ['travel budget tokyo 7', 'travel budget barcelona 5']
    },
    {
      name: 'tips',
      description: 'Get travel tips for a destination',
      usage: 'travel tips <destination>',
      examples: ['travel tips japan', 'travel tips europe']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'destination': {
        const searchTerm = Object.values(params).join(' ').toLowerCase().replace(/^["']|["']$/g, '').replace(/\s+/g, '');

        if (!searchTerm) {
          return {
            success: false,
            message: 'Please specify a destination. Usage: travel destination <place>\n\n' +
              'Available: ' + Object.keys(destinations).join(', ')
          };
        }

        const dest = destinations[searchTerm];

        if (!dest) {
          return {
            success: true,
            message: '✈️ DESTINATION: ' + searchTerm.toUpperCase() + '\n\n' +
              'Detailed information not available for this destination.\n\n' +
              'Available destinations: ' + Object.values(destinations).map(d => d.name).join(', ') + '\n\n' +
              'Try "travel tips ' + searchTerm + '" for general travel advice.'
          };
        }

        let destText = '✈️ DESTINATION GUIDE\n\n';
        destText += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        destText += '🌍 ' + dest.name.toUpperCase() + ', ' + dest.country.toUpperCase() + '\n';
        destText += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        destText += '📅 Best Time to Visit:\n   ' + dest.bestTime + '\n\n';
        destText += '💰 Average Cost: $' + dest.avgCostPerDay + '/day (' + dest.currency + ')\n\n';
        destText += '⭐ Top Highlights:\n';
        dest.highlights.forEach((h, i) => {
          destText += '   ' + (i + 1) + '. ' + h + '\n';
        });
        destText += '\n📋 Use "travel itinerary ' + searchTerm + ' <days>" for a trip plan.';

        return {
          success: true,
          message: destText
        };
      }

      case 'itinerary': {
        const searchTerm = (params.arg0 as string)?.toLowerCase().replace(/^["']|["']$/g, '');
        const days = parseInt((params.arg1 as string)) || 5;

        if (!searchTerm) {
          return {
            success: false,
            message: 'Please specify destination and days. Usage: travel itinerary <destination> <days>'
          };
        }

        const dest = destinations[searchTerm];
        const destName = dest ? dest.name : searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);

        let itinText = '🗓️ ' + days + '-DAY ITINERARY: ' + destName.toUpperCase() + '\n\n';
        itinText += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        const activities = dest ? dest.highlights : ['Explore city center', 'Visit local markets', 'Try local cuisine', 'Cultural sites', 'Scenic viewpoints'];

        for (let i = 1; i <= days; i++) {
          itinText += 'DAY ' + i + ':\n';
          itinText += '──────────────────────────────\n';
          
          if (i === 1) {
            itinText += '  🌅 Morning: Arrival & Check-in\n';
            itinText += '  🌆 Afternoon: Orientation walk\n';
            itinText += '  🌙 Evening: ' + (dest ? activities[0] : 'Welcome dinner') + '\n';
          } else if (i === days) {
            itinText += '  🌅 Morning: Last-minute sightseeing\n';
            itinText += '  🌆 Afternoon: Souvenir shopping\n';
            itinText += '  🌙 Evening: Departure\n';
          } else {
            const actIdx = (i - 1) % activities.length;
            itinText += '  🌅 Morning: ' + activities[actIdx] + '\n';
            itinText += '  🌆 Afternoon: ' + activities[(actIdx + 1) % activities.length] + '\n';
            itinText += '  🌙 Evening: Local dining & exploration\n';
          }
          itinText += '\n';
        }

        if (dest) {
          itinText += '💰 Estimated Budget: $' + (dest.avgCostPerDay * days) + ' (' + days + ' days x $' + dest.avgCostPerDay + '/day)\n';
        }

        return {
          success: true,
          message: itinText
        };
      }

      case 'packing': {
        const tripType = (params.arg0 as string)?.toLowerCase() || 'general';
        const validTypes = Object.keys(packingEssentials);

        if (!validTypes.includes(tripType)) {
          return {
            success: false,
            message: 'Invalid trip type. Choose from: ' + validTypes.join(', ')
          };
        }

        const items = [...packingEssentials.general, ...packingEssentials[tripType]];
        const uniqueItems = [...new Set(items)];

        let packText = '🧳 PACKING LIST: ' + tripType.toUpperCase() + ' TRIP\n\n';
        packText += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        packText += 'ESSENTIALS:\n';
        
        packingEssentials.general.forEach(item => {
          packText += '  □ ' + item + '\n';
        });

        packText += '\n' + tripType.toUpperCase() + ' SPECIFIC:\n';
        packingEssentials[tripType].forEach(item => {
          packText += '  □ ' + item + '\n';
        });

        packText += '\n📝 TIPS:\n';
        packText += '  • Roll clothes to save space\n';
        packText += '  • Pack versatile items\n';
        packText += '  • Keep valuables in carry-on\n';
        packText += '  • Check airline baggage limits';

        return {
          success: true,
          message: packText
        };
      }

      case 'budget': {
        const searchTerm = (params.arg0 as string)?.toLowerCase().replace(/^["']|["']$/g, '');
        const days = parseInt((params.arg1 as string)) || 7;

        if (!searchTerm) {
          return {
            success: false,
            message: 'Please specify destination and days. Usage: travel budget <destination> <days>'
          };
        }

        const dest = destinations[searchTerm];
        const dailyCost = dest ? dest.avgCostPerDay : 150;
        const destName = dest ? dest.name : searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);

        const accommodation = dailyCost * 0.4 * days;
        const food = dailyCost * 0.3 * days;
        const activities = dailyCost * 0.2 * days;
        const transport = dailyCost * 0.1 * days;
        const total = dailyCost * days;

        let budgetText = '💰 TRIP BUDGET ESTIMATE\n\n';
        budgetText += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        budgetText += '📍 ' + destName + ' | ' + days + ' days\n';
        budgetText += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        budgetText += 'BREAKDOWN:\n';
        budgetText += '──────────────────────────────\n';
        budgetText += '🏨 Accommodation:    $' + Math.round(accommodation).toString().padStart(6) + '\n';
        budgetText += '🍽️  Food & Dining:    $' + Math.round(food).toString().padStart(6) + '\n';
        budgetText += '🎯 Activities:       $' + Math.round(activities).toString().padStart(6) + '\n';
        budgetText += '🚌 Local Transport:  $' + Math.round(transport).toString().padStart(6) + '\n';
        budgetText += '──────────────────────────────\n';
        budgetText += '💵 TOTAL ESTIMATE:   $' + Math.round(total).toString().padStart(6) + '\n\n';
        budgetText += '* Excludes flights and travel insurance\n';
        budgetText += '* Budget travelers: -30% | Luxury: +50%';

        return {
          success: true,
          message: budgetText
        };
      }

      case 'tips': {
        const region = Object.values(params).join(' ').toLowerCase();

        let tipsText = '💡 TRAVEL TIPS';
        
        if (region) {
          tipsText += ': ' + region.toUpperCase();
        }
        tipsText += '\n\n';
        tipsText += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        tipsText += '📱 BEFORE YOU GO:\n';
        tipsText += '  • Check visa requirements\n';
        tipsText += '  • Get travel insurance\n';
        tipsText += '  • Download offline maps\n';
        tipsText += '  • Notify your bank of travel\n\n';

        tipsText += '✈️ DURING TRAVEL:\n';
        tipsText += '  • Keep copies of documents\n';
        tipsText += '  • Use hotel safe for valuables\n';
        tipsText += '  • Stay hydrated on flights\n';
        tipsText += '  • Learn basic local phrases\n\n';

        tipsText += '💡 MONEY TIPS:\n';
        tipsText += '  • Use no-fee travel cards\n';
        tipsText += '  • Withdraw larger amounts less often\n';
        tipsText += '  • Carry some local cash\n';
        tipsText += '  • Research tipping customs\n\n';

        tipsText += '📍 Specify a destination for location-specific tips!';

        return {
          success: true,
          message: tipsText
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: destination, itinerary, packing, budget, tips'
        };
    }
  }
};

export default travelPlanner;
