import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface Recipe {
  id: string;
  name: string;
  cuisine: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';
  ingredients: string[];
  instructions: string[];
  dietary: string[];
}

const mockRecipes: Recipe[] = [
  {
    id: 'RCP-001',
    name: 'Classic Spaghetti Carbonara',
    cuisine: 'Italian',
    prepTime: 10,
    cookTime: 20,
    servings: 4,
    difficulty: 'medium',
    ingredients: ['400g spaghetti', '200g pancetta', '4 egg yolks', '100g parmesan', 'Black pepper'],
    instructions: ['Cook pasta al dente', 'Fry pancetta until crispy', 'Mix eggs with cheese', 'Combine all off heat', 'Season generously'],
    dietary: []
  },
  {
    id: 'RCP-002',
    name: 'Quick Vegetable Stir Fry',
    cuisine: 'Asian',
    prepTime: 10,
    cookTime: 10,
    servings: 2,
    difficulty: 'easy',
    ingredients: ['Mixed vegetables', 'Soy sauce', 'Garlic', 'Ginger', 'Sesame oil', 'Rice'],
    instructions: ['Prep all vegetables', 'Heat wok with oil', 'Add garlic and ginger', 'Stir fry vegetables', 'Add soy sauce and serve'],
    dietary: ['vegetarian', 'vegan']
  },
  {
    id: 'RCP-003',
    name: 'Grilled Chicken Salad',
    cuisine: 'American',
    prepTime: 15,
    cookTime: 15,
    servings: 2,
    difficulty: 'easy',
    ingredients: ['Chicken breast', 'Mixed greens', 'Cherry tomatoes', 'Cucumber', 'Olive oil', 'Lemon'],
    instructions: ['Season and grill chicken', 'Prepare vegetables', 'Make lemon dressing', 'Slice chicken', 'Assemble salad'],
    dietary: ['gluten-free', 'low-carb']
  },
  {
    id: 'RCP-004',
    name: 'Beef Tacos',
    cuisine: 'Mexican',
    prepTime: 15,
    cookTime: 20,
    servings: 4,
    difficulty: 'easy',
    ingredients: ['Ground beef', 'Taco shells', 'Lettuce', 'Tomatoes', 'Cheese', 'Sour cream', 'Taco seasoning'],
    instructions: ['Brown the beef', 'Add taco seasoning', 'Warm taco shells', 'Prep toppings', 'Assemble tacos'],
    dietary: []
  },
  {
    id: 'RCP-005',
    name: 'Mushroom Risotto',
    cuisine: 'Italian',
    prepTime: 10,
    cookTime: 30,
    servings: 4,
    difficulty: 'medium',
    ingredients: ['Arborio rice', 'Mixed mushrooms', 'White wine', 'Vegetable stock', 'Parmesan', 'Butter', 'Onion'],
    instructions: ['Saute onions', 'Toast rice', 'Add wine', 'Gradually add stock', 'Stir in mushrooms'],
    dietary: ['vegetarian']
  }
];

interface RecipeState {
  favorites: string[];
  recentlyViewed: string[];
}

const state: RecipeState = {
  favorites: [],
  recentlyViewed: []
};

export const recipeFinder: BuiltInSkill = {
  id: 'recipe-finder',
  name: 'Recipe Finder',
  description: 'Discover delicious recipes for any occasion. Filter by dietary needs, cooking time, and ingredients.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '🍳',
  category: 'personal',
  installCount: 4234,
  rating: 4.6,
  commands: [
    {
      name: 'find',
      description: 'Find recipes by keyword or cuisine',
      usage: 'recipe find <keyword>',
      examples: ['recipe find pasta', 'recipe find "quick dinner"']
    },
    {
      name: 'quick',
      description: 'Find recipes under 30 minutes',
      usage: 'recipe quick [cuisine]',
      examples: ['recipe quick', 'recipe quick asian']
    },
    {
      name: 'view',
      description: 'View full recipe details',
      usage: 'recipe view <recipe-id>',
      examples: ['recipe view RCP-001']
    },
    {
      name: 'random',
      description: 'Get a random recipe suggestion',
      usage: 'recipe random',
      examples: ['recipe random']
    },
    {
      name: 'dietary',
      description: 'Find recipes for dietary restrictions',
      usage: 'recipe dietary <restriction>',
      examples: ['recipe dietary vegetarian', 'recipe dietary gluten-free']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'find': {
        const keyword = Object.values(params).join(' ').toLowerCase().replace(/^["']|["']$/g, '');
        if (!keyword) {
          return { success: false, message: 'Please provide a search term. Usage: recipe find <keyword>' };
        }
        const matches = mockRecipes.filter(r =>
          r.name.toLowerCase().includes(keyword) ||
          r.cuisine.toLowerCase().includes(keyword) ||
          r.ingredients.some(i => i.toLowerCase().includes(keyword))
        );
        if (matches.length === 0) {
          return { success: true, message: 'No recipes found for "' + keyword + '". Try "recipe random" for inspiration!' };
        }
        let findText = 'RECIPES MATCHING "' + keyword.toUpperCase() + '"\n\n';
        matches.forEach((recipe, i) => {
          const totalTime = recipe.prepTime + recipe.cookTime;
          findText += (i + 1) + '. ' + recipe.name + ' (' + recipe.id + ')\n';
          findText += '   ' + recipe.cuisine + ' | ' + totalTime + ' min | ' + recipe.difficulty + '\n\n';
        });
        findText += 'Use "recipe view <id>" for full recipe.';
        return { success: true, message: findText };
      }
      case 'quick': {
        const cuisine = (params.arg0 as string)?.toLowerCase();
        let quickRecipes = mockRecipes.filter(r => (r.prepTime + r.cookTime) <= 30);
        if (cuisine) {
          quickRecipes = quickRecipes.filter(r => r.cuisine.toLowerCase().includes(cuisine));
        }
        if (quickRecipes.length === 0) {
          return { success: true, message: 'No quick recipes found' + (cuisine ? ' for ' + cuisine : '') + '.' };
        }
        let quickText = 'QUICK RECIPES (Under 30 min)\n\n';
        quickRecipes.forEach((recipe) => {
          const totalTime = recipe.prepTime + recipe.cookTime;
          quickText += recipe.name + '\n   ' + totalTime + ' min | ' + recipe.difficulty + ' | ID: ' + recipe.id + '\n\n';
        });
        return { success: true, message: quickText };
      }
      case 'view': {
        const recipeId = (params.arg0 as string)?.toUpperCase();
        if (!recipeId) {
          return { success: false, message: 'Please specify a recipe ID. Usage: recipe view <recipe-id>' };
        }
        const recipe = mockRecipes.find(r => r.id === recipeId);
        if (!recipe) {
          return { success: false, message: 'Recipe ' + recipeId + ' not found.' };
        }
        state.recentlyViewed.unshift(recipe.id);
        let viewText = recipe.name.toUpperCase() + '\n\n';
        viewText += 'Cuisine: ' + recipe.cuisine + ' | Difficulty: ' + recipe.difficulty + '\n';
        viewText += 'Prep: ' + recipe.prepTime + ' min | Cook: ' + recipe.cookTime + ' min | Serves: ' + recipe.servings + '\n\n';
        viewText += 'INGREDIENTS:\n';
        recipe.ingredients.forEach(ing => { viewText += '  - ' + ing + '\n'; });
        viewText += '\nINSTRUCTIONS:\n';
        recipe.instructions.forEach((step, i) => { viewText += '  ' + (i + 1) + '. ' + step + '\n'; });
        return { success: true, message: viewText };
      }
      case 'random': {
        const recipe = mockRecipes[Math.floor(Math.random() * mockRecipes.length)];
        const totalTime = recipe.prepTime + recipe.cookTime;
        return {
          success: true,
          message: 'RANDOM SUGGESTION\n\n' + recipe.name + '\n' +
            'Cuisine: ' + recipe.cuisine + ' | Time: ' + totalTime + ' min\n' +
            'Use "recipe view ' + recipe.id + '" for the full recipe!'
        };
      }
      case 'dietary': {
        const restriction = Object.values(params).join(' ').toLowerCase();
        if (!restriction) {
          return { success: false, message: 'Please specify a dietary restriction.\nAvailable: vegetarian, vegan, gluten-free, low-carb' };
        }
        const matches = mockRecipes.filter(r => r.dietary.some(d => d.toLowerCase().includes(restriction)));
        if (matches.length === 0) {
          return { success: true, message: 'No ' + restriction + ' recipes found.' };
        }
        let dietText = restriction.toUpperCase() + ' RECIPES\n\n';
        matches.forEach((recipe, i) => {
          dietText += (i + 1) + '. ' + recipe.name + ' (' + recipe.id + ')\n';
        });
        return { success: true, message: dietText };
      }
      default:
        return { success: false, message: 'Unknown command: ' + action + '. Available commands: find, quick, view, random, dietary' };
    }
  }
};

export default recipeFinder;
