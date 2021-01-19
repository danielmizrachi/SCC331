import WebSocket from 'ws'
import Store from '../store'
import { Theme } from './store'

export type WSClient = {
  expiresIn: string,
  socket: WebSocket,
  userId: number
}

export type PacketType = 'AUTH' | 'AUTH_SUCCESS' | 'CREATE_BACKUP' | 'LIVE_UPDATE' | 'QUERY' | 'LOAD_BACKUP' | 'ZONE_REPORT' | 'PERSON_REPORT' | 'SETTING_REPORT' | 'CREATE_THEME' | 'ACTIVATE_THEME' | 'FACTORY_RESET' | 'SETUP'
export type FactoryResetType = 'FACTORYRESET' | 'REFRESH' | 'REVERT' | 'WIPEUSERINFO' | 'WIPESPECIFICUSER'

export type Packet = {
  type: PacketType
}
export interface AuthPacket extends Packet {
  type: 'AUTH',
  username: string,
  password: string
}
export interface LiveUpdatePacket extends Packet {
  type: 'LIVE_UPDATE',
  entities: Store
}

export interface TokenPacket extends Packet {
  token: string
}
export interface AuthSuccessPacket extends TokenPacket {
  type: 'AUTH_SUCCESS',
  entities: Store,
  themes: Theme[]
}
export interface QueryPacket extends TokenPacket {
  type: 'QUERY',
  query: string
}
export interface CreateBackupPacket extends TokenPacket {
  type: 'CREATE_BACKUP',
  backupType: string,
  title: string,
  description: string,
  zoneId?: number
}
export interface LoadBackupPacket extends TokenPacket {
  type: 'LOAD_BACKUP',
  backupType: string,
  backupName: string,
  zoneId?: number
}
export interface ZoneReportPacket extends TokenPacket {
  type: 'ZONE_REPORT',
  start: string,
  end: string,
  name: string,
  zoneId: number
}
export interface PersonReportPacket extends TokenPacket {
  type: 'PERSON_REPORT',
  name: string,
  personId: number
}
export interface SettingReportPacket extends TokenPacket {
  type: 'SETTING_REPORT',
  start: string,
  name: string,
  end: string
}
export interface ActivateThemePacket extends TokenPacket {
  type: 'ACTIVATE_THEME',
  themeId: number
}
export interface CreateThemePacket extends TokenPacket {
  type: 'CREATE_THEME',
  name: string,
  bgColor: string,
  sidebarColor: string,
  headerColor: string,
  containerColor: string,
  companyName: string,
  companyLogo: string,
  setActive: boolean
}
export interface FactoryResetPacket extends TokenPacket {
  type: 'FACTORY_RESET',
  resetType: FactoryResetType,
  resetBackups?: boolean,
  userId?: number
}
