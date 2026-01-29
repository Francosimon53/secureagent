/**
 * Family Providers - Exports
 */

// Base
export {
  BaseFamilyProvider,
  FamilyProviderRegistry,
  getFamilyProviderRegistry,
  initFamilyProviderRegistry,
  resetFamilyProviderRegistry,
} from './base.js';

// Calendar
export {
  type CalendarSyncResult,
  type ParsedCalendarEvent,
  type CalendarSyncOptions,
  SchoolCalendarProvider,
  ICalProvider,
  GoogleCalendarProvider,
  ManualCalendarProvider,
  createCalendarProvider,
} from './calendar.js';

// Recipe
export {
  type RecipeSearchParams,
  type RecipeSearchResult,
  RecipeAPIProvider,
  SpoonacularProvider,
  EdamamProvider,
  createRecipeProvider,
} from './recipe.js';

// Games
export {
  type GamePromptContext,
  GamesGenerationProvider,
  GameTemplates,
  createGamesProvider,
} from './games.js';
