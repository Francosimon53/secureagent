/**
 * Trello Integration - Types
 */

/**
 * Trello board
 */
export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  descData?: unknown;
  closed: boolean;
  idOrganization?: string;
  pinned: boolean;
  url: string;
  shortUrl: string;
  prefs: BoardPrefs;
  labelNames: Record<string, string>;
  starred: boolean;
  memberships: BoardMembership[];
  shortLink: string;
  dateLastActivity: string;
  dateLastView?: string;
}

export interface BoardPrefs {
  permissionLevel: 'private' | 'org' | 'public';
  hideVotes: boolean;
  voting: 'disabled' | 'members' | 'observers' | 'org' | 'public';
  comments: 'disabled' | 'members' | 'observers' | 'org' | 'public';
  invitations: 'admins' | 'members';
  selfJoin: boolean;
  cardCovers: boolean;
  cardAging: 'regular' | 'pirate';
  calendarFeedEnabled: boolean;
  background: string;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundImageScaled?: { width: number; height: number; url: string }[];
  backgroundTile: boolean;
  backgroundBrightness: 'dark' | 'light' | 'unknown';
  canBePublic: boolean;
  canBeOrg: boolean;
  canBePrivate: boolean;
  canInvite: boolean;
}

export interface BoardMembership {
  id: string;
  idMember: string;
  memberType: 'admin' | 'normal' | 'observer';
  unconfirmed: boolean;
  deactivated: boolean;
}

/**
 * Trello list
 */
export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  idBoard: string;
  pos: number;
  subscribed: boolean;
  softLimit?: number;
}

/**
 * Trello card
 */
export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  descData?: unknown;
  closed: boolean;
  idBoard: string;
  idList: string;
  idMembers: string[];
  idLabels: string[];
  idShort: number;
  idAttachmentCover?: string;
  pos: number;
  shortLink: string;
  shortUrl: string;
  url: string;
  due?: string;
  dueComplete: boolean;
  start?: string;
  subscribed: boolean;
  dateLastActivity: string;
  labels: TrelloLabel[];
  badges: CardBadges;
  cover: CardCover;
  isTemplate: boolean;
  cardRole?: string;
}

export interface CardBadges {
  attachmentsByType: {
    trello: { board: number; card: number };
  };
  location: boolean;
  votes: number;
  viewingMemberVoted: boolean;
  subscribed: boolean;
  fogbugz: string;
  checkItems: number;
  checkItemsChecked: number;
  checkItemsEarliestDue?: string;
  comments: number;
  attachments: number;
  description: boolean;
  due?: string;
  dueComplete: boolean;
  start?: string;
}

export interface CardCover {
  idAttachment?: string;
  color?: string;
  idUploadedBackground?: string;
  size: 'normal' | 'full';
  brightness: 'dark' | 'light';
  idPlugin?: string;
}

/**
 * Trello label
 */
export interface TrelloLabel {
  id: string;
  idBoard: string;
  name: string;
  color: TrelloColor | null;
}

export type TrelloColor =
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'blue'
  | 'sky'
  | 'lime'
  | 'pink'
  | 'black';

/**
 * Trello member
 */
export interface TrelloMember {
  id: string;
  fullName: string;
  username: string;
  initials: string;
  avatarHash?: string;
  avatarUrl?: string;
  memberType: 'admin' | 'normal' | 'observer' | 'ghost';
  confirmed: boolean;
  status: 'active' | 'disconnected' | 'idle';
}

/**
 * Trello comment (action)
 */
export interface TrelloComment {
  id: string;
  idMemberCreator: string;
  data: {
    text: string;
    card: { id: string; name: string; shortLink: string };
    board: { id: string; name: string; shortLink: string };
    list?: { id: string; name: string };
  };
  type: 'commentCard';
  date: string;
  memberCreator: TrelloMember;
}

/**
 * Trello checklist
 */
export interface TrelloChecklist {
  id: string;
  name: string;
  idBoard: string;
  idCard: string;
  pos: number;
  checkItems: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  name: string;
  nameData?: unknown;
  pos: number;
  state: 'complete' | 'incomplete';
  due?: string;
  idMember?: string;
  idChecklist: string;
}

/**
 * Trello attachment
 */
export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  pos: number;
  bytes?: number;
  date: string;
  edgeColor?: string;
  idMember: string;
  isUpload: boolean;
  mimeType?: string;
  previews?: { width: number; height: number; url: string }[];
}

/**
 * Create card input
 */
export interface CreateCardInput {
  name: string;
  idList: string;
  desc?: string;
  pos?: 'top' | 'bottom' | number;
  due?: string;
  start?: string;
  dueComplete?: boolean;
  idMembers?: string[];
  idLabels?: string[];
  urlSource?: string;
  idCardSource?: string;
}

/**
 * Update card input
 */
export interface UpdateCardInput {
  name?: string;
  desc?: string;
  closed?: boolean;
  idList?: string;
  pos?: 'top' | 'bottom' | number;
  due?: string | null;
  start?: string | null;
  dueComplete?: boolean;
  idMembers?: string[];
  idLabels?: string[];
  cover?: {
    color?: TrelloColor;
    brightness?: 'dark' | 'light';
    size?: 'normal' | 'full';
  };
}

/**
 * Board with lists and cards
 */
export interface BoardWithDetails extends TrelloBoard {
  lists: TrelloList[];
  cards: TrelloCard[];
}
