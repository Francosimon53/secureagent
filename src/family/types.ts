/**
 * Family Features Module - Type Definitions
 *
 * Comprehensive types for family management including:
 * - Family groups and members
 * - Meal planning and grocery lists
 * - School calendar events
 * - Family projects and research
 * - Shared memories
 * - Kid-friendly games
 * - Recipe suggestions
 */

// ============================================================================
// Family Group Types
// ============================================================================

export interface FamilyGroup {
  id: string;
  name: string;
  createdBy: string;
  members: FamilyMember[];
  settings: FamilyGroupSettings;
  createdAt: number;
  updatedAt: number;
}

export type FamilyMemberRole = 'admin' | 'parent' | 'child' | 'guest';

export interface FamilyMember {
  userId: string;
  role: FamilyMemberRole;
  nickname?: string;
  birthDate?: number;
  dietaryRestrictions?: DietaryInfo;
  joinedAt: number;
}

export type MealPlanStartDay = 'sunday' | 'monday';

export interface FamilyGroupSettings {
  timezone: string;
  defaultReminderMinutes: number[];
  mealPlanStartDay: MealPlanStartDay;
  shareMemoriesEnabled: boolean;
  kidSafeMode: boolean;
}

// ============================================================================
// Meal Planning Types
// ============================================================================

export interface MealPlan {
  id: string;
  familyGroupId: string;
  createdBy: string;
  weekStartDate: number;
  meals: Record<number, DayMeals>; // date timestamp -> meals
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface DayMeals {
  breakfast?: PlannedMeal;
  lunch?: PlannedMeal;
  dinner?: PlannedMeal;
  snacks?: PlannedMeal[];
}

export interface PlannedMeal {
  id: string;
  name: string;
  recipeId?: string;
  servings: number;
  assignedTo?: string; // userId who will prepare
  notes?: string;
}

export type GroceryListStatus = 'active' | 'completed' | 'archived';

export interface GroceryList {
  id: string;
  familyGroupId: string;
  mealPlanId?: string;
  items: GroceryItem[];
  storeSortedItems?: Record<string, StoreSortedItems>;
  status: GroceryListStatus;
  createdAt: number;
  updatedAt: number;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  aisle?: string;
  store?: string;
  estimatedPrice?: number;
  isPurchased: boolean;
  purchasedBy?: string;
}

export interface StoreSortedItems {
  storeName: string;
  aisles: Record<string, GroceryItem[]>;
  uncategorized: GroceryItem[];
  estimatedTotal: number;
}

// ============================================================================
// School Calendar Types
// ============================================================================

export type SchoolEventType = 'class' | 'exam' | 'holiday' | 'activity' | 'meeting' | 'deadline' | 'other';

export interface SchoolEvent {
  id: string;
  familyGroupId: string;
  sourceId: string;
  childUserId?: string;
  externalId?: string;
  title: string;
  description?: string;
  eventType: SchoolEventType;
  startTime: number;
  endTime: number;
  location?: string;
  isAllDay: boolean;
  reminders: EventReminder[];
  createdAt: number;
  updatedAt: number;
}

export type CalendarProvider = 'google' | 'outlook' | 'ical' | 'manual';
export type SyncStatus = 'active' | 'error' | 'disabled';

export interface SchoolCalendarSource {
  id: string;
  familyGroupId: string;
  childUserId?: string;
  name: string;
  provider: CalendarProvider;
  syncUrl?: string;
  credentials?: string; // encrypted
  lastSyncAt?: number;
  syncStatus: SyncStatus;
  createdAt: number;
}

export type ReminderChannel = 'push' | 'email' | 'sms';

export interface EventReminder {
  id: string;
  eventId: string;
  minutesBefore: number;
  channels: ReminderChannel[];
  sent: boolean;
  sentAt?: number;
}

export interface ScheduledReminder {
  id: string;
  eventId: string;
  familyGroupId: string;
  minutesBefore: number;
  channels: ReminderChannel[];
  scheduledFor: number;
  sent: boolean;
  sentAt?: number;
  createdAt: number;
}

// ============================================================================
// Family Projects Types
// ============================================================================

export type ProjectStatus = 'planning' | 'active' | 'completed' | 'archived';
export type TopicStatus = 'not_started' | 'in_progress' | 'completed';

export interface FamilyProject {
  id: string;
  familyGroupId: string;
  createdBy: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  topics: ResearchTopic[];
  members: ProjectMember[];
  deadline?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ResearchTopic {
  id: string;
  title: string;
  description?: string;
  assignedTo?: string;
  status: TopicStatus;
  notes: TopicNote[];
  links: string[];
  updatedAt: number;
}

export interface TopicNote {
  id: string;
  authorId: string;
  content: string;
  sources?: string[];
  createdAt: number;
}

export type ProjectMemberRole = 'owner' | 'contributor' | 'viewer';

export interface ProjectMember {
  userId: string;
  role: ProjectMemberRole;
  joinedAt: number;
}

export interface WeeklyResearchSummary {
  id: string;
  projectId: string;
  weekStartDate: number;
  topicUpdates: TopicUpdate[];
  highlights?: string[];
  nextSteps?: string[];
  generatedAt: number;
}

export interface TopicUpdate {
  topicId: string;
  topicTitle: string;
  notesAdded: number;
  linksAdded: number;
  statusChange?: { from: TopicStatus; to: TopicStatus };
  summary: string;
}

// ============================================================================
// Shared Memories Types
// ============================================================================

export type SharedMemoryType = 'fact' | 'preference' | 'context' | 'summary';

export interface SharedMemory {
  id: string;
  familyGroupId: string;
  originalMemoryId: string;
  originalUserId: string;
  sharedWith: string[]; // userIds
  content: string; // encrypted
  type: SharedMemoryType;
  category?: string;
  importance: number;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface EncryptedContent {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface SharedMemoryWithEncryption {
  id: string;
  familyGroupId: string;
  originalMemoryId: string;
  originalUserId: string;
  sharedWith: string[];
  contentCiphertext: string;
  contentIv: string;
  contentTag: string;
  type: SharedMemoryType;
  category?: string;
  importance: number;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface MemorySharingSettings {
  userId: string;
  familyGroupId: string;
  autoShareCategories?: string[];
  requireApproval: boolean;
  shareWithChildren: boolean;
  encryptionKeyId: string;
  createdAt: number;
  updatedAt: number;
}

export type ConsentScope = 'all' | 'category' | 'individual';

export interface MemoryShareConsent {
  fromUserId: string;
  toUserId: string;
  familyGroupId: string;
  scope: ConsentScope;
  categories?: string[];
  grantedAt: number;
  expiresAt?: number;
}

// ============================================================================
// Games Generator Types
// ============================================================================

export type GameType = 'trivia' | 'word_game' | 'math_game' | 'puzzle' | 'story_prompt' | 'scavenger_hunt' | 'riddles';
export type GameDuration = 'quick' | 'medium' | 'long'; // 5min, 15min, 30min+
export type GameDifficulty = 'easy' | 'medium' | 'hard';

export interface GeneratedGame {
  id: string;
  familyGroupId: string;
  createdBy: string;
  createdFor?: string[]; // specific children
  gameType: GameType;
  title: string;
  description?: string;
  ageRange: AgeRange;
  duration: GameDuration;
  content: GameContent;
  difficulty: GameDifficulty;
  educational: boolean;
  topics?: string[];
  played?: GamePlayRecord[];
  rating?: number;
  createdAt: number;
}

export interface AgeRange {
  min: number;
  max: number;
}

export interface GameContent {
  title?: string;
  description?: string;
  instructions: string;
  questions?: GameQuestion[];
  words?: string[];
  clues?: string[];
  story?: string;
  challenges?: string[];
  answers?: Record<string, string>;
}

export interface GameQuestion {
  id: string;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  points?: number;
}

export interface GamePlayRecord {
  playedAt: number;
  players: string[];
  score?: number;
  duration?: number;
}

export interface GameGenerationRequest {
  familyGroupId: string;
  createdBy: string;
  gameType: GameType;
  ageRange: AgeRange;
  duration: GameDuration;
  difficulty: GameDifficulty;
  topics?: string[];
  educational?: boolean;
  createdFor?: string[];
}

// ============================================================================
// Recipe Suggestions Types
// ============================================================================

export type RecipeCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';
export type RecipeDifficulty = 'easy' | 'medium' | 'hard';

export interface Recipe {
  id: string;
  familyGroupId?: string;
  addedBy?: string;
  name: string;
  description?: string;
  cuisine?: string;
  category: RecipeCategory;
  ingredients: RecipeIngredient[];
  instructions: string[];
  prepTime: number; // minutes
  cookTime: number; // minutes
  servings: number;
  difficulty: RecipeDifficulty;
  dietaryInfo: DietaryInfo;
  nutritionInfo?: NutritionInfo;
  imageUrl?: string;
  sourceUrl?: string;
  rating?: number;
  timesCooked: number;
  lastCookedAt?: number;
  isFavorite: boolean;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface RecipeIngredient {
  name: string;
  amount: number;
  unit: string;
  optional?: boolean;
  notes?: string;
}

export interface DietaryInfo {
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  dairyFree: boolean;
  nutFree: boolean;
  lowCarb: boolean;
  allergies?: string[];
}

export interface NutritionInfo {
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  fiber?: number;
  sodium?: number;
}

export interface AvailableIngredient {
  id: string;
  familyGroupId: string;
  name: string;
  amount?: number;
  unit?: string;
  expiresAt?: number;
  addedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface RecipeSuggestion {
  recipe: Recipe;
  matchScore: number;
  matchedIngredients: string[];
  missingIngredients: string[];
}

export interface RecipeSearchCriteria {
  familyGroupId: string;
  category?: RecipeCategory;
  maxPrepTime?: number;
  maxCookTime?: number;
  difficulty?: RecipeDifficulty;
  dietaryRequirements?: Partial<DietaryInfo>;
  tags?: string[];
  searchTerm?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export const FAMILY_EVENTS = {
  // Family group events
  GROUP_CREATED: 'family.group.created',
  GROUP_UPDATED: 'family.group.updated',
  MEMBER_INVITED: 'family.member.invited',
  MEMBER_JOINED: 'family.member.joined',
  MEMBER_LEFT: 'family.member.left',

  // Meal planning events
  MEAL_PLAN_CREATED: 'family.meal-plan.created',
  MEAL_PLAN_UPDATED: 'family.meal-plan.updated',
  GROCERY_LIST_GENERATED: 'family.grocery-list.generated',
  GROCERY_ITEM_PURCHASED: 'family.grocery-list.item-purchased',
  GROCERY_LIST_COMPLETED: 'family.grocery-list.completed',

  // School calendar events
  SCHOOL_EVENTS_SYNCED: 'family.school-event.synced',
  SCHOOL_EVENT_REMINDER: 'family.school-event.reminder',
  SCHOOL_EVENT_UPCOMING: 'family.school-event.upcoming',
  SCHOOL_CALENDAR_ERROR: 'family.school-calendar.sync-error',

  // Project events
  PROJECT_CREATED: 'family.project.created',
  PROJECT_UPDATED: 'family.project.updated',
  TOPIC_UPDATED: 'family.project.topic-updated',
  RESEARCH_SUMMARY_READY: 'family.project.summary-generated',
  PROJECT_REMINDER: 'family.project.reminder',

  // Shared memory events
  MEMORY_SHARED: 'family.memory.shared',
  MEMORY_ACCESS_REQUESTED: 'family.memory.access-requested',
  MEMORY_ACCESS_GRANTED: 'family.memory.access-granted',
  MEMORY_ACCESS_REVOKED: 'family.memory.access-revoked',

  // Games events
  GAME_GENERATED: 'family.game.generated',
  GAME_PLAYED: 'family.game.played',
  GAME_RATED: 'family.game.rated',

  // Recipe events
  RECIPES_SUGGESTED: 'family.recipe.suggested',
  RECIPE_COOKED: 'family.recipe.cooked',
  RECIPE_ADDED: 'family.recipe.added',
  PANTRY_UPDATED: 'family.pantry.updated',
} as const;

export type FamilyEventType = typeof FAMILY_EVENTS[keyof typeof FAMILY_EVENTS];

// ============================================================================
// Provider Types
// ============================================================================

export interface ProviderConfig {
  enabled: boolean;
  apiKeyEnvVar?: string;
}

export interface CalendarProviderConfig extends ProviderConfig {
  provider: CalendarProvider;
  syncIntervalMinutes: number;
}

export interface RecipeProviderConfig extends ProviderConfig {
  provider: 'spoonacular' | 'edamam';
  maxResults: number;
}

export interface GamesProviderConfig extends ProviderConfig {
  model: string;
  maxTokens: number;
  kidSafePrompts?: boolean;
}

export interface ProviderResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cached?: boolean;
}

// ============================================================================
// Store Types
// ============================================================================

export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

export interface StoreOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

// ============================================================================
// Query Options
// ============================================================================

export interface FamilyGroupQueryOptions extends StoreOptions {
  userId?: string;
  role?: FamilyMemberRole;
}

export interface MealPlanQueryOptions extends StoreOptions {
  familyGroupId: string;
  startDate?: number;
  endDate?: number;
}

export interface GroceryListQueryOptions extends StoreOptions {
  familyGroupId: string;
  status?: GroceryListStatus;
  mealPlanId?: string;
}

export interface SchoolEventQueryOptions extends StoreOptions {
  familyGroupId: string;
  childUserId?: string;
  startTime?: number;
  endTime?: number;
  eventType?: SchoolEventType;
}

export interface ProjectQueryOptions extends StoreOptions {
  familyGroupId: string;
  status?: ProjectStatus;
  createdBy?: string;
}

export interface SharedMemoryQueryOptions extends StoreOptions {
  familyGroupId: string;
  userId?: string;
  type?: SharedMemoryType;
  category?: string;
}

export interface GameQueryOptions extends StoreOptions {
  familyGroupId: string;
  gameType?: GameType;
  ageMin?: number;
  ageMax?: number;
  difficulty?: GameDifficulty;
}

export interface RecipeQueryOptions extends StoreOptions {
  familyGroupId?: string;
  category?: RecipeCategory;
  difficulty?: RecipeDifficulty;
  isFavorite?: boolean;
  searchTerm?: string;
}

export interface IngredientQueryOptions extends StoreOptions {
  familyGroupId: string;
  expiringBefore?: number;
}
