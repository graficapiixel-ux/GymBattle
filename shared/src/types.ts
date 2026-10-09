import type { AttributeKey } from './progression.js';
import type { Equipment } from './items/equipment.js';

export type Role = 'USER' | 'ADMIN';

export interface AvatarLook {
  skin: string;
  face: number;
  hair: number;
  hairColor: string;
  beard: number;
  body: number;
  /** Não é mais usada (todos têm o mesmo tamanho); mantida por compatibilidade. */
  height: number;
  /** 0 = masculino, 1 = feminino. */
  gender: number;
  eyes: string;
  marks: number;
  accessory: number;
  /** Cor da regata e do short (sem armadura). */
  top: string;
  shorts: string;
}

export const DEFAULT_AVATAR: AvatarLook = {
  skin: '#c68c5c',
  face: 0,
  hair: 1,
  hairColor: '#2b1d14',
  beard: 0,
  body: 0,
  height: 1,
  gender: 0,
  eyes: '#3b2414',
  marks: 0,
  accessory: 0,
  top: '#2a2a33',
  shorts: '#3a3a48',
};

export interface PublicUser {
  id: string;
  username: string;
  level: number;
  title: string | null;
  avatar: AvatarLook;
  equipment: Equipment;
}

export interface MeUser extends PublicUser {
  email: string;
  role: Role;
  xp: number;
  xpToNext: number;
  gold: number;
  attrPoints: number;
  attributes: Record<AttributeKey, number>;
  streak: number;
  rankPoints: number;
  isAdmin: boolean;
  /** Arma inicial escolhida (null = ainda precisa escolher). */
  starterWeapon: string | null;
  /** Protegido contra desafios até (ISO) ou null. */
  protectedUntil: string | null;
  createdAt: string;
  /** Grupo atual (null = sem grupo). */
  groupId: string | null;
  /** Cargo no grupo: OWNER (criador) | ADMIN | MEMBER. Não é o admin do site. */
  groupRole: GroupRole | null;
}

export type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface GroupMemberDTO extends PublicUser {
  groupRole: GroupRole;
  rankPoints: number;
  joinedAt: string | null;
}

export interface GroupDTO {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
  /** Torneio (ranking/desafios/temporada) liberado: grupo com o mínimo de pessoas. */
  tournamentOpen: boolean;
  minForTournament: number;
}

export interface GroupInviteDTO {
  id: string;
  group: { id: string; name: string; memberCount: number };
  invitedBy: PublicUser | null;
  createdAt: string;
}

export interface AppConfig {
  signupEnabled: boolean;
  /** Escudos de 36 h ligados pelo admin. */
  shieldsEnabled: boolean;
}

/** Detalhes de um jogador no painel do administrador. */
export interface AdminUserDetail {
  id: string;
  username: string;
  email: string;
  level: number;
  xp: number;
  xpToNext: number;
  gold: number;
  attrPoints: number;
  /** Evento lendário armado para a próxima luta. */
  legendNext: boolean;
  items: { itemId: string; name: string; kind: 'weapon' | 'armor'; equipped: boolean; starter?: boolean }[];
}

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  role: Role;
  level: number;
  gold: number;
  createdAt: string;
}

/** Presente recebido (aviso grande na tela quando tem motivo). */
export interface GiftDTO {
  id: string;
  kind: 'XP' | 'GOLD' | 'ITEM';
  amount: number;
  itemId: string | null;
  itemName: string | null;
  itemKind: 'weapon' | 'armor' | null;
  rarity: string | null;
  reason: string | null;
  source: 'ADMIN' | 'EVENT';
  createdAt: string;
}
