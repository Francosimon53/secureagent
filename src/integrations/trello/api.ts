/**
 * Trello Integration - API Wrapper
 */

import type {
  TrelloBoard,
  TrelloList,
  TrelloCard,
  TrelloComment,
  TrelloMember,
  BoardWithDetails,
  CreateCardInput,
  UpdateCardInput,
} from './types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';

const TRELLO_API_BASE = 'https://api.trello.com/1';

/**
 * Trello API client configuration
 */
export interface TrelloApiConfig {
  apiKey: string;
  token: string;
}

/**
 * Trello API client
 */
export class TrelloApi {
  private apiKey: string;
  private token: string;

  constructor(config: TrelloApiConfig) {
    this.apiKey = config.apiKey;
    this.token = config.token;
  }

  /**
   * Make authenticated request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const params = new URLSearchParams({
      key: this.apiKey,
      token: this.token,
    });

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
    }

    const url = `${TRELLO_API_BASE}${path}?${params.toString()}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();

      if (response.status === 401) {
        throw new IntegrationError(
          'Trello authentication failed',
          INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
          'trello',
        );
      }

      if (response.status === 429) {
        throw new IntegrationError(
          'Trello rate limit exceeded',
          INTEGRATION_ERROR_CODES.RATE_LIMITED,
          'trello',
        );
      }

      if (response.status === 404) {
        throw new IntegrationError(
          'Trello resource not found',
          INTEGRATION_ERROR_CODES.NOT_FOUND,
          'trello',
        );
      }

      throw new IntegrationError(
        `Trello API error: ${error}`,
        INTEGRATION_ERROR_CODES.API_ERROR,
        'trello',
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get current member (self)
   */
  async getMe(): Promise<TrelloMember> {
    return this.request<TrelloMember>('GET', '/members/me');
  }

  /**
   * List user's boards
   */
  async listBoards(): Promise<TrelloBoard[]> {
    return this.request<TrelloBoard[]>('GET', '/members/me/boards', undefined, {
      filter: 'open',
      fields: 'all',
    });
  }

  /**
   * Get a board by ID
   */
  async getBoard(boardId: string): Promise<TrelloBoard> {
    return this.request<TrelloBoard>('GET', `/boards/${boardId}`, undefined, {
      fields: 'all',
    });
  }

  /**
   * Get board with lists and cards
   */
  async getBoardWithDetails(boardId: string): Promise<BoardWithDetails> {
    const board = await this.getBoard(boardId);
    const lists = await this.getBoardLists(boardId);
    const cards = await this.getBoardCards(boardId);

    return {
      ...board,
      lists,
      cards,
    };
  }

  /**
   * Get lists on a board
   */
  async getBoardLists(boardId: string): Promise<TrelloList[]> {
    return this.request<TrelloList[]>(
      'GET',
      `/boards/${boardId}/lists`,
      undefined,
      { filter: 'open' },
    );
  }

  /**
   * Get cards on a board
   */
  async getBoardCards(boardId: string): Promise<TrelloCard[]> {
    return this.request<TrelloCard[]>(
      'GET',
      `/boards/${boardId}/cards`,
      undefined,
      { filter: 'visible' },
    );
  }

  /**
   * Get cards in a list
   */
  async getListCards(listId: string): Promise<TrelloCard[]> {
    return this.request<TrelloCard[]>('GET', `/lists/${listId}/cards`);
  }

  /**
   * Get a card by ID
   */
  async getCard(cardId: string): Promise<TrelloCard> {
    return this.request<TrelloCard>('GET', `/cards/${cardId}`, undefined, {
      fields: 'all',
      members: 'true',
      member_fields: 'fullName,username',
      checklists: 'all',
      attachments: 'true',
    });
  }

  /**
   * Create a new card
   */
  async createCard(input: CreateCardInput): Promise<TrelloCard> {
    const params: Record<string, string | number | boolean | undefined> = {
      name: input.name,
      idList: input.idList,
      desc: input.desc,
      pos: input.pos,
      due: input.due,
      start: input.start,
      dueComplete: input.dueComplete,
      idMembers: input.idMembers?.join(','),
      idLabels: input.idLabels?.join(','),
      urlSource: input.urlSource,
      idCardSource: input.idCardSource,
    };

    return this.request<TrelloCard>('POST', '/cards', undefined, params);
  }

  /**
   * Update a card
   */
  async updateCard(cardId: string, input: UpdateCardInput): Promise<TrelloCard> {
    const params: Record<string, string | number | boolean | undefined> = {};

    if (input.name !== undefined) params.name = input.name;
    if (input.desc !== undefined) params.desc = input.desc;
    if (input.closed !== undefined) params.closed = input.closed;
    if (input.idList !== undefined) params.idList = input.idList;
    if (input.pos !== undefined) params.pos = input.pos;
    if (input.due !== undefined) params.due = input.due || '';
    if (input.start !== undefined) params.start = input.start || '';
    if (input.dueComplete !== undefined) params.dueComplete = input.dueComplete;
    if (input.idMembers !== undefined) params.idMembers = input.idMembers.join(',');
    if (input.idLabels !== undefined) params.idLabels = input.idLabels.join(',');

    return this.request<TrelloCard>('PUT', `/cards/${cardId}`, undefined, params);
  }

  /**
   * Move a card to a different list
   */
  async moveCard(
    cardId: string,
    listId: string,
    pos?: 'top' | 'bottom' | number,
  ): Promise<TrelloCard> {
    return this.updateCard(cardId, { idList: listId, pos });
  }

  /**
   * Archive a card
   */
  async archiveCard(cardId: string): Promise<TrelloCard> {
    return this.updateCard(cardId, { closed: true });
  }

  /**
   * Unarchive a card
   */
  async unarchiveCard(cardId: string): Promise<TrelloCard> {
    return this.updateCard(cardId, { closed: false });
  }

  /**
   * Delete a card
   */
  async deleteCard(cardId: string): Promise<void> {
    await this.request<void>('DELETE', `/cards/${cardId}`);
  }

  /**
   * Add a comment to a card
   */
  async addComment(cardId: string, text: string): Promise<TrelloComment> {
    return this.request<TrelloComment>(
      'POST',
      `/cards/${cardId}/actions/comments`,
      undefined,
      { text },
    );
  }

  /**
   * Get comments on a card
   */
  async getCardComments(cardId: string): Promise<TrelloComment[]> {
    return this.request<TrelloComment[]>(
      'GET',
      `/cards/${cardId}/actions`,
      undefined,
      { filter: 'commentCard' },
    );
  }

  /**
   * Add a member to a card
   */
  async addMemberToCard(cardId: string, memberId: string): Promise<void> {
    await this.request<void>(
      'POST',
      `/cards/${cardId}/idMembers`,
      undefined,
      { value: memberId },
    );
  }

  /**
   * Remove a member from a card
   */
  async removeMemberFromCard(cardId: string, memberId: string): Promise<void> {
    await this.request<void>('DELETE', `/cards/${cardId}/idMembers/${memberId}`);
  }

  /**
   * Add a label to a card
   */
  async addLabelToCard(cardId: string, labelId: string): Promise<void> {
    await this.request<void>(
      'POST',
      `/cards/${cardId}/idLabels`,
      undefined,
      { value: labelId },
    );
  }

  /**
   * Remove a label from a card
   */
  async removeLabelFromCard(cardId: string, labelId: string): Promise<void> {
    await this.request<void>('DELETE', `/cards/${cardId}/idLabels/${labelId}`);
  }

  /**
   * Verify credentials
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.getMe();
      return true;
    } catch {
      return false;
    }
  }
}
