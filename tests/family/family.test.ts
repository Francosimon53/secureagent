/**
 * Family Features Module Tests
 *
 * Unit and integration tests for the family features module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  // Manager
  FamilyManager,
  initFamily,
  getFamilyManager,
  isFamilyInitialized,

  // Config
  FamilyConfigSchema,
  validateFamilyConfig,
  safeParseFamilyConfig,
  getDefaultFamilyConfig,

  // Stores
  createFamilyGroupStore,
  createMealPlanStore,
  createGroceryListStore,
  createRecipeStore,
  createAvailableIngredientStore,
  createSchoolEventStore,
  createSchoolCalendarSourceStore,
  createEventReminderStore,
  createProjectStore,
  createWeeklySummaryStore,
  createSharedMemoryStore,
  createMemorySharingSettingsStore,
  createMemoryConsentStore,
  createGamesStore,

  // Services
  GroceryGenerator,
  createGroceryGenerator,
  IngredientMatcher,
  createIngredientMatcher,

  // Types
  type FamilyGroup,
  type FamilyMember,
  type MealPlan,
  type GroceryList,
  type Recipe,
  type SchoolEvent,
  type FamilyProject,
  type GeneratedGame,
  type AvailableIngredient,
  type FamilyGroupStore,
  type MealPlanStore,
  type GroceryListStore,
  type RecipeStore,
  type AvailableIngredientStore,
  type SchoolEventStore,
  type ProjectStore,
  type GamesStore,
} from '../../src/family/index.js';

// =============================================================================
// Configuration Tests
// =============================================================================

describe('Family Configuration', () => {
  it('should parse valid configuration', () => {
    const config = validateFamilyConfig({
      enabled: true,
      storeType: 'memory',
    });

    expect(config.enabled).toBe(true);
    expect(config.storeType).toBe('memory');
  });

  it('should apply default values', () => {
    const config = getDefaultFamilyConfig();

    expect(config.enabled).toBe(true);
    expect(config.storeType).toBe('database');
    expect(config.maxFamilyGroupsPerUser).toBe(5);
    expect(config.maxMembersPerGroup).toBe(20);
  });

  it('should validate with safeParse', () => {
    const result = safeParseFamilyConfig({
      enabled: true,
      mealPlanning: {
        defaultServings: 6,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mealPlanning?.defaultServings).toBe(6);
    }
  });

  it('should reject invalid configuration', () => {
    const result = safeParseFamilyConfig({
      enabled: 'invalid', // Should be boolean
    });

    expect(result.success).toBe(false);
  });

  it('should validate nested feature configs', () => {
    const result = FamilyConfigSchema.safeParse({
      games: {
        maxGamesPerDay: 20,
        kidSafePrompts: true,
      },
      recipes: {
        provider: 'spoonacular',
        maxSuggestions: 15,
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.games?.maxGamesPerDay).toBe(20);
    expect(result.data?.recipes?.maxSuggestions).toBe(15);
  });
});

// =============================================================================
// Family Group Store Tests
// =============================================================================

describe('FamilyGroupStore', () => {
  let store: FamilyGroupStore;

  beforeEach(async () => {
    store = createFamilyGroupStore('memory');
    await store.initialize();
  });

  it('should create a family group', async () => {
    const group = await store.createGroup({
      name: 'The Smiths',
      createdBy: 'user-1',
      members: [
        { userId: 'user-1', role: 'admin', joinedAt: Date.now() },
      ],
      settings: {
        timezone: 'America/New_York',
        defaultReminderMinutes: [60],
        mealPlanStartDay: 'sunday',
        shareMemoriesEnabled: true,
        kidSafeMode: true,
      },
    });

    expect(group.id).toBeDefined();
    expect(group.name).toBe('The Smiths');
    expect(group.createdBy).toBe('user-1');
    expect(group.members).toHaveLength(1);
    expect(group.members[0].role).toBe('admin');
  });

  it('should get a group by ID', async () => {
    const created = await store.createGroup({
      name: 'Test Family',
      createdBy: 'user-1',
      members: [{ userId: 'user-1', role: 'admin', joinedAt: Date.now() }],
      settings: {
        timezone: 'UTC',
        defaultReminderMinutes: [],
        mealPlanStartDay: 'monday',
        shareMemoriesEnabled: true,
        kidSafeMode: true,
      },
    });

    const retrieved = await store.getGroup(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(created.id);
    expect(retrieved?.name).toBe('Test Family');
  });

  it('should update a group', async () => {
    const group = await store.createGroup({
      name: 'Original Name',
      createdBy: 'user-1',
      members: [{ userId: 'user-1', role: 'admin', joinedAt: Date.now() }],
      settings: {
        timezone: 'UTC',
        defaultReminderMinutes: [],
        mealPlanStartDay: 'sunday',
        shareMemoriesEnabled: true,
        kidSafeMode: true,
      },
    });

    // Small delay to ensure updatedAt is different
    await new Promise(resolve => setTimeout(resolve, 1));

    const updated = await store.updateGroup(group.id, { name: 'New Name' });

    expect(updated?.name).toBe('New Name');
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(group.createdAt);
  });

  it('should add a member', async () => {
    const group = await store.createGroup({
      name: 'Family',
      createdBy: 'user-1',
      members: [{ userId: 'user-1', role: 'admin', joinedAt: Date.now() }],
      settings: {
        timezone: 'UTC',
        defaultReminderMinutes: [],
        mealPlanStartDay: 'sunday',
        shareMemoriesEnabled: true,
        kidSafeMode: true,
      },
    });

    const updated = await store.addMember(group.id, {
      userId: 'user-2',
      role: 'parent',
    });

    expect(updated?.members).toHaveLength(2);
    expect(updated?.members.find(m => m.userId === 'user-2')?.role).toBe('parent');
  });

  it('should remove a member', async () => {
    const group = await store.createGroup({
      name: 'Family',
      createdBy: 'user-1',
      members: [
        { userId: 'user-1', role: 'admin', joinedAt: Date.now() },
        { userId: 'user-2', role: 'parent', joinedAt: Date.now() },
      ],
      settings: {
        timezone: 'UTC',
        defaultReminderMinutes: [],
        mealPlanStartDay: 'sunday',
        shareMemoriesEnabled: true,
        kidSafeMode: true,
      },
    });

    const updated = await store.removeMember(group.id, 'user-2');

    expect(updated?.members).toHaveLength(1);
    expect(updated?.members.find(m => m.userId === 'user-2')).toBeUndefined();
  });

  it('should get groups by user', async () => {
    await store.createGroup({
      name: 'Family 1',
      createdBy: 'user-1',
      members: [{ userId: 'user-1', role: 'admin', joinedAt: Date.now() }],
      settings: {
        timezone: 'UTC',
        defaultReminderMinutes: [],
        mealPlanStartDay: 'sunday',
        shareMemoriesEnabled: true,
        kidSafeMode: true,
      },
    });

    await store.createGroup({
      name: 'Family 2',
      createdBy: 'user-1',
      members: [
        { userId: 'user-1', role: 'admin', joinedAt: Date.now() },
        { userId: 'user-2', role: 'parent', joinedAt: Date.now() },
      ],
      settings: {
        timezone: 'UTC',
        defaultReminderMinutes: [],
        mealPlanStartDay: 'sunday',
        shareMemoriesEnabled: true,
        kidSafeMode: true,
      },
    });

    const user1Groups = await store.getGroupsByUser('user-1');
    expect(user1Groups).toHaveLength(2);

    const user2Groups = await store.getGroupsByUser('user-2');
    expect(user2Groups).toHaveLength(1);
  });

  it('should get member role', async () => {
    const group = await store.createGroup({
      name: 'Family',
      createdBy: 'user-1',
      members: [
        { userId: 'user-1', role: 'admin', joinedAt: Date.now() },
        { userId: 'user-2', role: 'child', joinedAt: Date.now() },
      ],
      settings: {
        timezone: 'UTC',
        defaultReminderMinutes: [],
        mealPlanStartDay: 'sunday',
        shareMemoriesEnabled: true,
        kidSafeMode: true,
      },
    });

    const adminRole = await store.getMemberRole(group.id, 'user-1');
    expect(adminRole).toBe('admin');

    const childRole = await store.getMemberRole(group.id, 'user-2');
    expect(childRole).toBe('child');

    const unknownRole = await store.getMemberRole(group.id, 'user-3');
    expect(unknownRole).toBeNull();
  });

  it('should delete a group', async () => {
    const group = await store.createGroup({
      name: 'To Delete',
      createdBy: 'user-1',
      members: [{ userId: 'user-1', role: 'admin', joinedAt: Date.now() }],
      settings: {
        timezone: 'UTC',
        defaultReminderMinutes: [],
        mealPlanStartDay: 'sunday',
        shareMemoriesEnabled: true,
        kidSafeMode: true,
      },
    });

    const deleted = await store.deleteGroup(group.id);
    expect(deleted).toBe(true);

    const retrieved = await store.getGroup(group.id);
    expect(retrieved).toBeNull();
  });
});

// =============================================================================
// Meal Plan Store Tests
// =============================================================================

describe('MealPlanStore', () => {
  let store: MealPlanStore;

  beforeEach(async () => {
    store = createMealPlanStore('memory');
    await store.initialize();
  });

  it('should create a meal plan', async () => {
    const now = Date.now();
    const plan = await store.createMealPlan({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      weekStartDate: now,
      meals: {},
    });

    expect(plan.id).toBeDefined();
    expect(plan.familyGroupId).toBe('family-1');
    expect(plan.createdBy).toBe('user-1');
    expect(plan.weekStartDate).toBe(now);
  });

  it('should get meal plan by ID', async () => {
    const created = await store.createMealPlan({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      weekStartDate: Date.now(),
      meals: {},
    });

    const retrieved = await store.getMealPlan(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(created.id);
  });

  it('should update meal plan', async () => {
    const plan = await store.createMealPlan({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      weekStartDate: Date.now(),
      meals: {},
    });

    const updated = await store.updateMealPlan(plan.id, {
      notes: 'Updated notes',
    });

    expect(updated?.notes).toBe('Updated notes');
  });

  it('should set a meal', async () => {
    const plan = await store.createMealPlan({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      weekStartDate: Date.now(),
      meals: {},
    });

    const dateKey = Date.now();
    const updated = await store.setMeal(plan.id, dateKey, 'breakfast', {
      id: 'meal-1',
      name: 'Pancakes',
      servings: 4,
    });

    expect(updated?.meals[dateKey]?.breakfast?.name).toBe('Pancakes');
  });

  it('should list meal plans', async () => {
    await store.createMealPlan({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      weekStartDate: Date.now(),
      meals: {},
    });

    await store.createMealPlan({
      familyGroupId: 'family-1',
      createdBy: 'user-2',
      weekStartDate: Date.now() + 604800000, // Next week
      meals: {},
    });

    const plans = await store.listMealPlans({ familyGroupId: 'family-1' });
    expect(plans).toHaveLength(2);
  });

  it('should delete a meal plan', async () => {
    const plan = await store.createMealPlan({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      weekStartDate: Date.now(),
      meals: {},
    });

    const deleted = await store.deleteMealPlan(plan.id);
    expect(deleted).toBe(true);

    const retrieved = await store.getMealPlan(plan.id);
    expect(retrieved).toBeNull();
  });
});

// =============================================================================
// Grocery List Store Tests
// =============================================================================

describe('GroceryListStore', () => {
  let store: GroceryListStore;

  beforeEach(async () => {
    store = createGroceryListStore('memory');
    await store.initialize();
  });

  it('should create a grocery list', async () => {
    const list = await store.createGroceryList({
      familyGroupId: 'family-1',
      items: [
        {
          id: 'item-1',
          name: 'Milk',
          quantity: 1,
          unit: 'gallon',
          category: 'dairy',
          isPurchased: false,
        },
      ],
      status: 'active',
    });

    expect(list.id).toBeDefined();
    expect(list.items).toHaveLength(1);
    expect(list.items[0].name).toBe('Milk');
  });

  it('should add item to list', async () => {
    const list = await store.createGroceryList({
      familyGroupId: 'family-1',
      items: [],
      status: 'active',
    });

    const updated = await store.addItem(list.id, {
      name: 'Eggs',
      quantity: 12,
      unit: 'count',
      category: 'dairy',
      isPurchased: false,
    });

    expect(updated?.items).toHaveLength(1);
    expect(updated?.items[0].name).toBe('Eggs');
  });

  it('should mark item as purchased', async () => {
    const list = await store.createGroceryList({
      familyGroupId: 'family-1',
      items: [
        {
          id: 'item-1',
          name: 'Bread',
          quantity: 1,
          unit: 'loaf',
          category: 'bakery',
          isPurchased: false,
        },
      ],
      status: 'active',
    });

    const updated = await store.markItemPurchased(list.id, 'item-1', 'user-1');

    expect(updated?.items[0].isPurchased).toBe(true);
    expect(updated?.items[0].purchasedBy).toBe('user-1');
  });

  it('should get active list for family', async () => {
    await store.createGroceryList({
      familyGroupId: 'family-1',
      items: [],
      status: 'active',
    });

    await store.createGroceryList({
      familyGroupId: 'family-1',
      items: [],
      status: 'completed',
    });

    const activeList = await store.getActiveList('family-1');
    expect(activeList).not.toBeNull();
    expect(activeList?.status).toBe('active');
  });
});

// =============================================================================
// Recipe Store Tests
// =============================================================================

describe('RecipeStore', () => {
  let store: RecipeStore;

  beforeEach(async () => {
    store = createRecipeStore('memory');
    await store.initialize();
  });

  it('should create a recipe', async () => {
    const recipe = await store.createRecipe({
      name: 'Spaghetti Carbonara',
      category: 'dinner',
      ingredients: [
        { name: 'spaghetti', amount: 400, unit: 'g' },
        { name: 'bacon', amount: 200, unit: 'g' },
        { name: 'eggs', amount: 4, unit: 'count' },
      ],
      instructions: ['Boil pasta', 'Fry bacon', 'Mix eggs', 'Combine'],
      prepTime: 10,
      cookTime: 20,
      servings: 4,
      difficulty: 'medium',
      dietaryInfo: {
        vegetarian: false,
        vegan: false,
        glutenFree: false,
        dairyFree: false,
        nutFree: true,
        lowCarb: false,
      },
      timesCooked: 0,
      isFavorite: false,
    });

    expect(recipe.id).toBeDefined();
    expect(recipe.name).toBe('Spaghetti Carbonara');
    expect(recipe.ingredients).toHaveLength(3);
  });

  it('should search recipes by name', async () => {
    await store.createRecipe({
      name: 'Chicken Stir Fry',
      category: 'dinner',
      ingredients: [],
      instructions: [],
      prepTime: 10,
      cookTime: 15,
      servings: 2,
      difficulty: 'easy',
      dietaryInfo: {
        vegetarian: false,
        vegan: false,
        glutenFree: true,
        dairyFree: true,
        nutFree: true,
        lowCarb: true,
      },
      timesCooked: 0,
      isFavorite: false,
    });

    await store.createRecipe({
      name: 'Beef Stir Fry',
      category: 'dinner',
      ingredients: [],
      instructions: [],
      prepTime: 10,
      cookTime: 15,
      servings: 2,
      difficulty: 'easy',
      dietaryInfo: {
        vegetarian: false,
        vegan: false,
        glutenFree: true,
        dairyFree: true,
        nutFree: true,
        lowCarb: true,
      },
      timesCooked: 0,
      isFavorite: false,
    });

    const results = await store.searchRecipes('stir fry');
    expect(results).toHaveLength(2);
  });

  it('should get recipes by category', async () => {
    await store.createRecipe({
      name: 'Pancakes',
      category: 'breakfast',
      ingredients: [],
      instructions: [],
      prepTime: 5,
      cookTime: 15,
      servings: 4,
      difficulty: 'easy',
      dietaryInfo: {
        vegetarian: true,
        vegan: false,
        glutenFree: false,
        dairyFree: false,
        nutFree: true,
        lowCarb: false,
      },
      timesCooked: 0,
      isFavorite: false,
    });

    await store.createRecipe({
      name: 'Pasta',
      category: 'dinner',
      ingredients: [],
      instructions: [],
      prepTime: 5,
      cookTime: 15,
      servings: 4,
      difficulty: 'easy',
      dietaryInfo: {
        vegetarian: true,
        vegan: false,
        glutenFree: false,
        dairyFree: false,
        nutFree: true,
        lowCarb: false,
      },
      timesCooked: 0,
      isFavorite: false,
    });

    const breakfastRecipes = await store.getByCategory('breakfast');
    expect(breakfastRecipes).toHaveLength(1);
    expect(breakfastRecipes[0].name).toBe('Pancakes');
  });

  it('should mark cooked and toggle favorite', async () => {
    const recipe = await store.createRecipe({
      name: 'Pizza',
      category: 'dinner',
      ingredients: [],
      instructions: [],
      prepTime: 30,
      cookTime: 15,
      servings: 4,
      difficulty: 'medium',
      dietaryInfo: {
        vegetarian: true,
        vegan: false,
        glutenFree: false,
        dairyFree: false,
        nutFree: true,
        lowCarb: false,
      },
      timesCooked: 0,
      isFavorite: false,
    });

    await store.markCooked(recipe.id);
    let updated = await store.getRecipe(recipe.id);
    expect(updated?.timesCooked).toBe(1);
    expect(updated?.lastCookedAt).toBeDefined();

    await store.toggleFavorite(recipe.id);
    updated = await store.getRecipe(recipe.id);
    expect(updated?.isFavorite).toBe(true);
  });
});

// =============================================================================
// School Event Store Tests
// =============================================================================

describe('SchoolEventStore', () => {
  let store: SchoolEventStore;

  beforeEach(async () => {
    store = createSchoolEventStore('memory');
    await store.initialize();
  });

  it('should create a school event', async () => {
    const now = Date.now();
    const event = await store.createEvent({
      familyGroupId: 'family-1',
      sourceId: 'source-1',
      childUserId: 'child-1',
      title: 'Math Test',
      eventType: 'exam',
      startTime: now + 86400000,
      endTime: now + 86400000 + 3600000,
      isAllDay: false,
      reminders: [],
    });

    expect(event.id).toBeDefined();
    expect(event.title).toBe('Math Test');
    expect(event.eventType).toBe('exam');
  });

  it('should get upcoming events', async () => {
    const now = Date.now();

    await store.createEvent({
      familyGroupId: 'family-1',
      sourceId: 'source-1',
      title: 'Past Event',
      eventType: 'class',
      startTime: now - 86400000,
      endTime: now - 86400000 + 3600000,
      isAllDay: false,
      reminders: [],
    });

    await store.createEvent({
      familyGroupId: 'family-1',
      sourceId: 'source-1',
      title: 'Future Event',
      eventType: 'activity',
      startTime: now + 86400000,
      endTime: now + 86400000 + 3600000,
      isAllDay: false,
      reminders: [],
    });

    const upcoming = await store.getUpcomingEvents('family-1', 7);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].title).toBe('Future Event');
  });

  it('should get events by child', async () => {
    const now = Date.now();

    await store.createEvent({
      familyGroupId: 'family-1',
      sourceId: 'source-1',
      childUserId: 'child-1',
      title: 'Child 1 Event',
      eventType: 'class',
      startTime: now + 86400000,
      endTime: now + 86400000 + 3600000,
      isAllDay: false,
      reminders: [],
    });

    await store.createEvent({
      familyGroupId: 'family-1',
      sourceId: 'source-1',
      childUserId: 'child-2',
      title: 'Child 2 Event',
      eventType: 'class',
      startTime: now + 86400000,
      endTime: now + 86400000 + 3600000,
      isAllDay: false,
      reminders: [],
    });

    const child1Events = await store.getEventsByChild('child-1');
    expect(child1Events).toHaveLength(1);
    expect(child1Events[0].title).toBe('Child 1 Event');
  });
});

// =============================================================================
// Project Store Tests
// =============================================================================

describe('ProjectStore', () => {
  let store: ProjectStore;

  beforeEach(async () => {
    store = createProjectStore('memory');
    await store.initialize();
  });

  it('should create a project', async () => {
    const project = await store.createProject({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      name: 'Summer Vacation Planning',
      status: 'planning',
      topics: [],
      members: [{ userId: 'user-1', role: 'owner', joinedAt: Date.now() }],
    });

    expect(project.id).toBeDefined();
    expect(project.name).toBe('Summer Vacation Planning');
    expect(project.status).toBe('planning');
  });

  it('should add and update topics', async () => {
    const project = await store.createProject({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      name: 'Home Renovation',
      status: 'active',
      topics: [],
      members: [{ userId: 'user-1', role: 'owner', joinedAt: Date.now() }],
    });

    const withTopic = await store.addTopic(project.id, {
      title: 'Kitchen Design',
      status: 'not_started',
      notes: [],
      links: [],
    });

    expect(withTopic?.topics).toHaveLength(1);
    expect(withTopic?.topics[0].title).toBe('Kitchen Design');

    const topicId = withTopic?.topics[0].id;
    const updated = await store.updateTopic(project.id, topicId!, {
      status: 'in_progress',
      description: 'Research modern kitchen designs',
    });

    expect(updated?.topics[0].status).toBe('in_progress');
    expect(updated?.topics[0].description).toBe('Research modern kitchen designs');
  });

  it('should add notes to topics', async () => {
    const project = await store.createProject({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      name: 'Research Project',
      status: 'active',
      topics: [{
        id: 'topic-1',
        title: 'Research Topic',
        status: 'in_progress',
        notes: [],
        links: [],
        updatedAt: Date.now(),
      }],
      members: [{ userId: 'user-1', role: 'owner', joinedAt: Date.now() }],
    });

    const updated = await store.addNote(project.id, 'topic-1', {
      authorId: 'user-1',
      content: 'Found interesting article',
      sources: ['https://example.com'],
    });

    expect(updated?.topics[0].notes).toHaveLength(1);
    expect(updated?.topics[0].notes[0].content).toBe('Found interesting article');
  });

  it('should list projects by family', async () => {
    await store.createProject({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      name: 'Project 1',
      status: 'active',
      topics: [],
      members: [],
    });

    await store.createProject({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      name: 'Project 2',
      status: 'completed',
      topics: [],
      members: [],
    });

    await store.createProject({
      familyGroupId: 'family-2',
      createdBy: 'user-2',
      name: 'Project 3',
      status: 'active',
      topics: [],
      members: [],
    });

    const family1Projects = await store.listProjects({ familyGroupId: 'family-1' });
    expect(family1Projects).toHaveLength(2);

    const activeProjects = await store.getActiveProjects('family-1');
    expect(activeProjects).toHaveLength(1);
    expect(activeProjects[0].name).toBe('Project 1');
  });
});

// =============================================================================
// Games Store Tests
// =============================================================================

describe('GamesStore', () => {
  let store: GamesStore;

  beforeEach(async () => {
    store = createGamesStore('memory');
    await store.initialize();
  });

  it('should create a game', async () => {
    const game = await store.createGame({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      gameType: 'trivia',
      title: 'Science Quiz',
      ageRange: { min: 8, max: 12 },
      duration: 'medium',
      content: {
        instructions: 'Answer the questions',
        questions: [
          {
            id: 'q1',
            question: 'What planet is closest to the sun?',
            options: ['Venus', 'Mercury', 'Mars', 'Earth'],
            correctAnswer: 'Mercury',
          },
        ],
      },
      difficulty: 'medium',
      educational: true,
      createdAt: Date.now(),
    });

    expect(game.id).toBeDefined();
    expect(game.title).toBe('Science Quiz');
    expect(game.gameType).toBe('trivia');
  });

  it('should get games by type', async () => {
    await store.createGame({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      gameType: 'trivia',
      title: 'Trivia Game',
      ageRange: { min: 5, max: 10 },
      duration: 'quick',
      content: { instructions: 'Play trivia' },
      difficulty: 'easy',
      educational: true,
      createdAt: Date.now(),
    });

    await store.createGame({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      gameType: 'word_game',
      title: 'Word Game',
      ageRange: { min: 5, max: 10 },
      duration: 'quick',
      content: { instructions: 'Play words' },
      difficulty: 'easy',
      educational: true,
      createdAt: Date.now(),
    });

    const triviaGames = await store.getGamesByType('family-1', 'trivia');
    expect(triviaGames).toHaveLength(1);
    expect(triviaGames[0].title).toBe('Trivia Game');
  });

  it('should get games for age range', async () => {
    await store.createGame({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      gameType: 'puzzle',
      title: 'Kids Puzzle',
      ageRange: { min: 3, max: 6 },
      duration: 'quick',
      content: { instructions: 'Solve puzzle' },
      difficulty: 'easy',
      educational: true,
      createdAt: Date.now(),
    });

    await store.createGame({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      gameType: 'puzzle',
      title: 'Teen Puzzle',
      ageRange: { min: 13, max: 17 },
      duration: 'medium',
      content: { instructions: 'Solve puzzle' },
      difficulty: 'hard',
      educational: true,
      createdAt: Date.now(),
    });

    const kidsGames = await store.getGamesForAgeRange('family-1', { min: 4, max: 5 });
    expect(kidsGames).toHaveLength(1);
    expect(kidsGames[0].title).toBe('Kids Puzzle');
  });

  it('should record play and update rating', async () => {
    const game = await store.createGame({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      gameType: 'riddles',
      title: 'Fun Riddles',
      ageRange: { min: 6, max: 12 },
      duration: 'quick',
      content: { instructions: 'Solve riddles' },
      difficulty: 'medium',
      educational: true,
      createdAt: Date.now(),
    });

    await store.recordPlay(game.id, {
      playedAt: Date.now(),
      players: ['child-1', 'child-2'],
      score: 8,
      duration: 600,
    });

    let updated = await store.getGame(game.id);
    expect(updated?.played).toHaveLength(1);
    expect(updated?.played?.[0].score).toBe(8);

    await store.updateRating(game.id, 4.5);
    updated = await store.getGame(game.id);
    expect(updated?.rating).toBe(4.5);
  });

  it('should count games created today', async () => {
    await store.createGame({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      gameType: 'trivia',
      title: 'Game 1',
      ageRange: { min: 5, max: 10 },
      duration: 'quick',
      content: { instructions: 'Play' },
      difficulty: 'easy',
      educational: true,
      createdAt: Date.now(),
    });

    await store.createGame({
      familyGroupId: 'family-1',
      createdBy: 'user-1',
      gameType: 'trivia',
      title: 'Game 2',
      ageRange: { min: 5, max: 10 },
      duration: 'quick',
      content: { instructions: 'Play' },
      difficulty: 'easy',
      educational: true,
      createdAt: Date.now(),
    });

    const count = await store.countGamesCreatedToday('family-1');
    expect(count).toBe(2);
  });
});

// =============================================================================
// Grocery Generator Tests
// =============================================================================

describe('GroceryGenerator', () => {
  let generator: GroceryGenerator;
  let recipeStore: RecipeStore;

  beforeEach(async () => {
    recipeStore = createRecipeStore('memory');
    await recipeStore.initialize();
    generator = createGroceryGenerator({}, recipeStore);
  });

  it('should generate grocery list from recipe IDs', async () => {
    const recipe1 = await recipeStore.createRecipe({
      name: 'Pasta',
      category: 'dinner',
      ingredients: [
        { name: 'pasta', amount: 200, unit: 'g' },
        { name: 'tomato sauce', amount: 1, unit: 'jar' },
      ],
      instructions: [],
      prepTime: 10,
      cookTime: 20,
      servings: 2,
      difficulty: 'easy',
      dietaryInfo: {
        vegetarian: true,
        vegan: true,
        glutenFree: false,
        dairyFree: true,
        nutFree: true,
        lowCarb: false,
      },
      timesCooked: 0,
      isFavorite: false,
    });

    const recipe2 = await recipeStore.createRecipe({
      name: 'More Pasta',
      category: 'dinner',
      ingredients: [
        { name: 'pasta', amount: 300, unit: 'g' },
        { name: 'cheese', amount: 100, unit: 'g' },
      ],
      instructions: [],
      prepTime: 10,
      cookTime: 20,
      servings: 2,
      difficulty: 'easy',
      dietaryInfo: {
        vegetarian: true,
        vegan: false,
        glutenFree: false,
        dairyFree: false,
        nutFree: true,
        lowCarb: false,
      },
      timesCooked: 0,
      isFavorite: false,
    });

    const groceryList = await generator.generateFromRecipes('family-1', [recipe1.id, recipe2.id]);

    expect(groceryList.items.length).toBeGreaterThan(0);
    expect(groceryList.familyGroupId).toBe('family-1');

    const pastaItem = groceryList.items.find(i => i.name.toLowerCase().includes('pasta'));
    expect(pastaItem).toBeDefined();
  });

  it('should categorize items correctly', async () => {
    const recipe = await recipeStore.createRecipe({
      name: 'Breakfast',
      category: 'breakfast',
      ingredients: [
        { name: 'milk', amount: 1, unit: 'liter' },
        { name: 'eggs', amount: 6, unit: 'count' },
        { name: 'bread', amount: 1, unit: 'loaf' },
        { name: 'apple', amount: 2, unit: 'count' },
      ],
      instructions: [],
      prepTime: 10,
      cookTime: 10,
      servings: 2,
      difficulty: 'easy',
      dietaryInfo: {
        vegetarian: true,
        vegan: false,
        glutenFree: false,
        dairyFree: false,
        nutFree: true,
        lowCarb: false,
      },
      timesCooked: 0,
      isFavorite: false,
    });

    const groceryList = await generator.generateFromRecipes('family-1', [recipe.id]);

    const milkItem = groceryList.items.find(i => i.name.toLowerCase() === 'milk');
    expect(milkItem?.category).toBe('dairy');

    const breadItem = groceryList.items.find(i => i.name.toLowerCase() === 'bread');
    expect(breadItem?.category).toBe('bakery');

    const appleItem = groceryList.items.find(i => i.name.toLowerCase() === 'apple');
    expect(appleItem?.category).toBe('produce');
  });
});

// =============================================================================
// Ingredient Matcher Tests
// =============================================================================

describe('IngredientMatcher', () => {
  let matcher: IngredientMatcher;

  beforeEach(() => {
    matcher = createIngredientMatcher();
  });

  it('should find matching recipes', () => {
    const recipes: Recipe[] = [
      {
        id: 'r1',
        name: 'Simple Pasta',
        category: 'dinner',
        ingredients: [
          { name: 'pasta', amount: 200, unit: 'g' },
          { name: 'olive oil', amount: 2, unit: 'tbsp' },
          { name: 'garlic', amount: 2, unit: 'cloves' },
        ],
        instructions: [],
        prepTime: 5,
        cookTime: 15,
        servings: 2,
        difficulty: 'easy',
        dietaryInfo: {
          vegetarian: true,
          vegan: true,
          glutenFree: false,
          dairyFree: true,
          nutFree: true,
          lowCarb: false,
        },
        timesCooked: 0,
        isFavorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'r2',
        name: 'Complex Dish',
        category: 'dinner',
        ingredients: [
          { name: 'chicken', amount: 500, unit: 'g' },
          { name: 'cream', amount: 200, unit: 'ml' },
          { name: 'mushrooms', amount: 100, unit: 'g' },
          { name: 'onion', amount: 1, unit: 'count' },
          { name: 'butter', amount: 50, unit: 'g' },
        ],
        instructions: [],
        prepTime: 20,
        cookTime: 40,
        servings: 4,
        difficulty: 'hard',
        dietaryInfo: {
          vegetarian: false,
          vegan: false,
          glutenFree: true,
          dairyFree: false,
          nutFree: true,
          lowCarb: true,
        },
        timesCooked: 0,
        isFavorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    // Available ingredients as AvailableIngredient objects
    const available = [
      { id: '1', familyGroupId: 'f1', name: 'pasta', addedBy: 'u1', createdAt: Date.now(), updatedAt: Date.now() },
      { id: '2', familyGroupId: 'f1', name: 'olive oil', addedBy: 'u1', createdAt: Date.now(), updatedAt: Date.now() },
      { id: '3', familyGroupId: 'f1', name: 'garlic', addedBy: 'u1', createdAt: Date.now(), updatedAt: Date.now() },
      { id: '4', familyGroupId: 'f1', name: 'salt', addedBy: 'u1', createdAt: Date.now(), updatedAt: Date.now() },
    ];

    const suggestions = matcher.matchRecipes(recipes, available);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].recipe.name).toBe('Simple Pasta');
    expect(suggestions[0].matchScore).toBeGreaterThan(suggestions[1]?.matchScore ?? 0);
  });

  it('should calculate match score correctly', () => {
    const recipe: Recipe = {
      id: 'r1',
      name: 'Test Recipe',
      category: 'dinner',
      ingredients: [
        // Use very distinct ingredient names to avoid fuzzy matching
        { name: 'chicken breast', amount: 1, unit: 'count' },
        { name: 'paprika spice', amount: 1, unit: 'count' },
        { name: 'maple syrup', amount: 1, unit: 'count' },
        { name: 'blue cheese', amount: 1, unit: 'count' },
      ],
      instructions: [],
      prepTime: 10,
      cookTime: 10,
      servings: 2,
      difficulty: 'easy',
      dietaryInfo: {
        vegetarian: true,
        vegan: true,
        glutenFree: true,
        dairyFree: true,
        nutFree: true,
        lowCarb: true,
      },
      timesCooked: 0,
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 2 out of 4 ingredients = 50% match
    const available = [
      { id: '1', familyGroupId: 'f1', name: 'chicken breast', addedBy: 'u1', createdAt: Date.now(), updatedAt: Date.now() },
      { id: '2', familyGroupId: 'f1', name: 'paprika spice', addedBy: 'u1', createdAt: Date.now(), updatedAt: Date.now() },
    ];
    const suggestions = matcher.matchRecipes([recipe], available);

    expect(suggestions[0].matchScore).toBeCloseTo(0.5, 1);
    expect(suggestions[0].matchedIngredients).toHaveLength(2);
    expect(suggestions[0].missingIngredients).toHaveLength(2);
  });
});

// =============================================================================
// Family Manager Tests
// =============================================================================

describe('FamilyManager', () => {
  let manager: FamilyManager;

  beforeEach(async () => {
    manager = new FamilyManager({
      enabled: true,
      storeType: 'memory',
    });
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  it('should initialize correctly', () => {
    expect(manager.isInitialized()).toBe(true);
  });

  it('should create a family group', async () => {
    const group = await manager.createFamilyGroup('Test Family', 'user-1');

    expect(group.id).toBeDefined();
    expect(group.name).toBe('Test Family');
    expect(group.createdBy).toBe('user-1');
    expect(group.members).toHaveLength(1);
    expect(group.members[0].userId).toBe('user-1');
    expect(group.members[0].role).toBe('admin');
  });

  it('should get family group', async () => {
    const created = await manager.createFamilyGroup('Test Family', 'user-1');
    const retrieved = await manager.getFamilyGroup(created.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Test Family');
  });

  it('should add and remove family members', async () => {
    const group = await manager.createFamilyGroup('Test Family', 'user-1');

    const withMember = await manager.addFamilyMember(group.id, {
      userId: 'user-2',
      role: 'parent',
    });

    expect(withMember?.members).toHaveLength(2);

    const withoutMember = await manager.removeFamilyMember(group.id, 'user-2');
    expect(withoutMember?.members).toHaveLength(1);
  });

  it('should get user family groups', async () => {
    await manager.createFamilyGroup('Family 1', 'user-1');
    await manager.createFamilyGroup('Family 2', 'user-1');

    const groups = await manager.getUserFamilyGroups('user-1');
    expect(groups).toHaveLength(2);
  });

  it('should provide access to services', async () => {
    expect(manager.getMealPlanningService()).toBeDefined();
    expect(manager.getRecipeSuggestionService()).toBeDefined();
    expect(manager.getSchoolCalendarService()).toBeDefined();
    expect(manager.getFamilyProjectService()).toBeDefined();
    expect(manager.getSharedMemoryService()).toBeDefined();
    expect(manager.getGamesGeneratorService()).toBeDefined();
  });

  it('should provide access to stores', async () => {
    expect(manager.getFamilyGroupStore()).toBeDefined();
    expect(manager.getMealPlanStore()).toBeDefined();
    expect(manager.getGroceryListStore()).toBeDefined();
    expect(manager.getRecipeStore()).toBeDefined();
    expect(manager.getIngredientStore()).toBeDefined();
    expect(manager.getSchoolEventStore()).toBeDefined();
    expect(manager.getProjectStore()).toBeDefined();
    expect(manager.getGamesStore()).toBeDefined();
  });
});

// =============================================================================
// Global Singleton Tests
// =============================================================================

describe('Family Global Singleton', () => {
  it('should initialize global singleton', async () => {
    // Skip if already initialized from previous test
    if (isFamilyInitialized()) {
      const manager = getFamilyManager();
      await manager.shutdown();
    }

    const manager = await initFamily({
      enabled: true,
      storeType: 'memory',
    });

    expect(manager).toBeDefined();
    expect(isFamilyInitialized()).toBe(true);

    const retrieved = getFamilyManager();
    expect(retrieved).toBe(manager);

    // Cleanup
    await manager.shutdown();
  });
});
