/**
 * Trello Integration - Tool Definitions
 */

import type { ToolDefinition } from '../types.js';
import type { TrelloApi } from './api.js';

/**
 * Create Trello tools
 */
export function createTrelloTools(api: TrelloApi): ToolDefinition[] {
  return [
    createListBoardsTool(api),
    createGetBoardTool(api),
    createCreateCardTool(api),
    createUpdateCardTool(api),
    createMoveCardTool(api),
    createAddCommentTool(api),
    createArchiveCardTool(api),
  ];
}

/**
 * List boards
 */
function createListBoardsTool(api: TrelloApi): ToolDefinition {
  return {
    name: 'trello_list_boards',
    description: "List all Trello boards the user has access to.",
    parameters: [],
    riskLevel: 'low',
    execute: async () => {
      try {
        const boards = await api.listBoards();

        return {
          success: true,
          data: {
            boards: boards.map((b) => ({
              id: b.id,
              name: b.name,
              description: b.desc,
              url: b.url,
              starred: b.starred,
              closed: b.closed,
              dateLastActivity: b.dateLastActivity,
            })),
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to list boards',
        };
      }
    },
  };
}

/**
 * Get board with lists and cards
 */
function createGetBoardTool(api: TrelloApi): ToolDefinition {
  return {
    name: 'trello_get_board',
    description: 'Get a Trello board with all its lists and cards.',
    parameters: [
      {
        name: 'boardId',
        type: 'string',
        description: 'The ID of the board',
        required: true,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const board = await api.getBoardWithDetails(params.boardId as string);

        return {
          success: true,
          data: {
            id: board.id,
            name: board.name,
            description: board.desc,
            url: board.url,
            lists: board.lists.map((l) => ({
              id: l.id,
              name: l.name,
              pos: l.pos,
            })),
            cards: board.cards.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.desc,
              listId: c.idList,
              url: c.url,
              due: c.due,
              dueComplete: c.dueComplete,
              labels: c.labels.map((l) => ({
                id: l.id,
                name: l.name,
                color: l.color,
              })),
            })),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get board',
        };
      }
    },
  };
}

/**
 * Create card
 */
function createCreateCardTool(api: TrelloApi): ToolDefinition {
  return {
    name: 'trello_create_card',
    description: 'Create a new card on a Trello board.',
    parameters: [
      {
        name: 'listId',
        type: 'string',
        description: 'The ID of the list to create the card in',
        required: true,
      },
      {
        name: 'name',
        type: 'string',
        description: 'Card title',
        required: true,
      },
      {
        name: 'description',
        type: 'string',
        description: 'Card description',
        required: false,
      },
      {
        name: 'due',
        type: 'string',
        description: 'Due date (ISO 8601 format)',
        required: false,
      },
      {
        name: 'position',
        type: 'string',
        description: 'Position: "top", "bottom", or a number',
        required: false,
        enum: ['top', 'bottom'],
      },
      {
        name: 'labelIds',
        type: 'array',
        description: 'Array of label IDs to add',
        required: false,
      },
      {
        name: 'memberIds',
        type: 'array',
        description: 'Array of member IDs to assign',
        required: false,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const card = await api.createCard({
          idList: params.listId as string,
          name: params.name as string,
          desc: params.description as string | undefined,
          due: params.due as string | undefined,
          pos: params.position as 'top' | 'bottom' | undefined,
          idLabels: params.labelIds as string[] | undefined,
          idMembers: params.memberIds as string[] | undefined,
        });

        return {
          success: true,
          data: {
            id: card.id,
            name: card.name,
            url: card.url,
            shortUrl: card.shortUrl,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to create card',
        };
      }
    },
  };
}

/**
 * Update card
 */
function createUpdateCardTool(api: TrelloApi): ToolDefinition {
  return {
    name: 'trello_update_card',
    description: 'Update an existing Trello card.',
    parameters: [
      {
        name: 'cardId',
        type: 'string',
        description: 'The ID of the card to update',
        required: true,
      },
      {
        name: 'name',
        type: 'string',
        description: 'New card title',
        required: false,
      },
      {
        name: 'description',
        type: 'string',
        description: 'New card description',
        required: false,
      },
      {
        name: 'due',
        type: 'string',
        description: 'New due date (ISO 8601 format, or empty to clear)',
        required: false,
      },
      {
        name: 'dueComplete',
        type: 'boolean',
        description: 'Whether the due date is complete',
        required: false,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const card = await api.updateCard(params.cardId as string, {
          name: params.name as string | undefined,
          desc: params.description as string | undefined,
          due: params.due as string | undefined,
          dueComplete: params.dueComplete as boolean | undefined,
        });

        return {
          success: true,
          data: {
            id: card.id,
            name: card.name,
            url: card.url,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to update card',
        };
      }
    },
  };
}

/**
 * Move card
 */
function createMoveCardTool(api: TrelloApi): ToolDefinition {
  return {
    name: 'trello_move_card',
    description: 'Move a card to a different list.',
    parameters: [
      {
        name: 'cardId',
        type: 'string',
        description: 'The ID of the card to move',
        required: true,
      },
      {
        name: 'listId',
        type: 'string',
        description: 'The ID of the destination list',
        required: true,
      },
      {
        name: 'position',
        type: 'string',
        description: 'Position in the list: "top", "bottom", or a number',
        required: false,
        enum: ['top', 'bottom'],
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const card = await api.moveCard(
          params.cardId as string,
          params.listId as string,
          params.position as 'top' | 'bottom' | undefined,
        );

        return {
          success: true,
          data: {
            id: card.id,
            name: card.name,
            listId: card.idList,
            url: card.url,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to move card',
        };
      }
    },
  };
}

/**
 * Add comment
 */
function createAddCommentTool(api: TrelloApi): ToolDefinition {
  return {
    name: 'trello_add_comment',
    description: 'Add a comment to a Trello card.',
    parameters: [
      {
        name: 'cardId',
        type: 'string',
        description: 'The ID of the card',
        required: true,
      },
      {
        name: 'text',
        type: 'string',
        description: 'Comment text',
        required: true,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const comment = await api.addComment(
          params.cardId as string,
          params.text as string,
        );

        return {
          success: true,
          data: {
            id: comment.id,
            text: comment.data.text,
            date: comment.date,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to add comment',
        };
      }
    },
  };
}

/**
 * Archive card
 */
function createArchiveCardTool(api: TrelloApi): ToolDefinition {
  return {
    name: 'trello_archive_card',
    description: 'Archive (close) a Trello card.',
    parameters: [
      {
        name: 'cardId',
        type: 'string',
        description: 'The ID of the card to archive',
        required: true,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const card = await api.archiveCard(params.cardId as string);

        return {
          success: true,
          data: {
            id: card.id,
            name: card.name,
            archived: card.closed,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to archive card',
        };
      }
    },
  };
}
