/*
 * All types are based on data retrieved from the DB
 * Primary types:
 * - Composed of each other and secondary types
 * - Those the server maintains a cache of
 * Secondary types:
 * - Compose primary types and each other
 * - Discarded once they're loaded into primary types
**/

// Primary types
export type Zone = {
  id: number,
  roomName: string,
  maxPeople: number,
  isSafe: boolean,
  isRestricted: boolean,
  idealResponsibleRatio: number[],
  temperatures?: TemperatureLog[],
  temperature?: number,
  activities?: ActivitySchedule[],
  population?: Person[],
  responsibleRatio?: number[],
  responsibleRatioViolated?: boolean
}
export type Person = {
  id: number,
  firstName: string,
  surname: string,
  age: number,
  responsible: boolean,
  role: Role,
  sensor: Sensor,
  isDependent: boolean,
  notes?: PersonNote[],
  isSignedIn?: boolean,
  lastSignedIn?: Date,
  zoneLocation?: Zone['id'],
  isInRestrictedZone?: boolean,
  emergencyContacts?: EmergencyContact[]
}
export type BackupLogs = {
  activity: BackupLog[],
  zone: BackupLog[],
  schedule: BackupLog[]
}
export type ActivityTemplate = {
  activityName: string,
  startTime: string,
  endTime: string
}
export type Role = {
  roleTitle: string
}
export type Sensor = {
  id: number,
  locations?: LocationLog[]
}
export type Activity = {
  name: string,
  maximumPeople: number
}
export type Notification = {
  description: string,
  critical: boolean,
  timestamp: Date
}
export type Theme = {
  id: number,
  name: string,
  bgColor: string,
  sidebarColor: string,
  headerColor: string,
  containerColor: string,
  companyName: string,
  companyLogo: string,
  createdAt: Date,
  isActive: boolean
}

// Secondary types
export type BackupLog = {
  name: string,
  tableName: string,
  timestamp: Date,
  type: BackupLogType,
  description?: string
}
export interface TemperatureLog {
  timestamp: Date,
  zone: Zone['id']
  tempReading: number
}
export interface LocationLog {
  timestamp: Date,
  zone: Zone['id']
  sensor: number
}
export type ActivitySchedule = {
  zoneId: Zone['id'],
  activity: Activity,
  startTime: Date,
  endTime: Date,
  duration?: number,
  status?: ActivityStatus,
  statusMessage?: string
}
export type SignInRecord = {
  personId: number,
  arrivalTime: Date,
  endTime?: Date
}
export type PersonNote = {
  id: number,
  text: string,
  personId: number,
  timestamp: Date,
  name?: string
}
export type EmergencyContact = {
  personId: number,
  firstName: string,
  surname: string,
  email: string,
  mobileNumber: string,
  altNumber: string
}

type BackupLogType = 'Activity' | 'Zone' | 'Schedule'
type ActivityStatus = 'FUTURE' | 'IN_PROGRESS' | 'FINISHED'
