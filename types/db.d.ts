import { ColumnValue, Request } from 'tedious'

export type TableName = 'activities' | 'activity_schedule' | 'backup_log' | 'digital_sign_in' | 'emergency_contacts' | 'location_logs' | 'notes' | 'people' | 'roles' | 'sensors' | 'temperature_logs' | 'zones'
export type Database = {
  [key in TableName]?: Row[]
}
export type Row = ColumnValue[]
export type QueryResult = {
  request: Request,
  values: ColumnValue[][]
}
