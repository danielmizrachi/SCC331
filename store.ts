import { TemperatureLog, Zone, ActivitySchedule, Activity, Notification, LocationLog, Person, Role, Sensor, SignInRecord, PersonNote, BackupLog, BackupLogs, EmergencyContact, ActivityTemplate } from './types/store'
import { Database, Row } from './types/db'
import ms = require('ms')
import { getActivityTemplates } from './scriptmanager'
import { ColumnValue } from 'tedious'

// Functions together calculate a simplified ratio x:y; NOT copied from StackOverflow!!!
const isWhole = (x: number) => x === Math.floor(x)
const simplifiedRatio = (x: number, y: number): number[] => {
  if (x === 0 && y === 0) {
    return [0, 0]
  }
  
  if (isWhole(x) && isWhole(y)) {
    return simplifiedRatio(x / 2, y / 2)
  } else {
    return [x * 2, y * 2]
  }
}

const sortByTimeAsc = (a: any, b: any) => {
  if(a > b) {
    return -1
  } else if (a === b) {
    return 0
  }
  return 1
}
const sortByTimeDesc = (a: any, b: any) => {
  if(a < b) {
    return -1
  } else if (a === b) {
    return 0
  }
  return 1
}

const ms2Mins = (ms: number) => Math.ceil(ms / 1000 / 60)

export default class Store {
  zones: Zone[]
  people: Person[]
  backupLogs: BackupLogs
  roles: Role[]
  sensors: Sensor[]
  activities: Activity[]
  notifications: Notification[]
  activityTemplates: ActivityTemplate[]
  
  constructor() {
    this.zones = null
    this.people = null
    this.backupLogs = {
      activity: [],
      zone: [],
      schedule: [],
    }
    this.roles = null
    this.sensors = null
    this.activities = null
    this.notifications = []
    this.activityTemplates = null
  }

  // Builds the store from a retieved database model
  async buildFromDb(database: Database) {
    // Temp arrays of values which get used in store values
    let tempLogs: TemperatureLog[] = null
    let activitySchedule: ActivitySchedule[] = null
    let locationLogs: LocationLog[] = null
    let signIns: SignInRecord[] = null
    let peopleNotes: PersonNote[] = null
    let emergencyContacts: EmergencyContact[] = null
  
    // Start by aggregating temperature logs
    if (database.temperature_logs) {
      tempLogs = database.temperature_logs.map(row => ({
        timestamp: new Date(Store.findColInRow(row, 'timestamp')),
        zone: Store.findColInRow(row, 'zone_id'),
        tempReading: Store.findColInRow(row, 'temp_reading')
      })).sort((a, b) => sortByTimeAsc(a.timestamp.getTime(), b.timestamp.getTime()))
    }
  
    // Then current activities
    if (database.activities) {
      this.activities = database.activities.map(row => ({
        name: Store.findColInRow(row, 'name'),
        maximumPeople: Store.findColInRow(row, 'maximum_people')
      }))
    }
  
    // Then the schedules for those activities
    if (this.activities && database.activity_schedule) {
      activitySchedule = database.activity_schedule.map(row => {
        const schedule: ActivitySchedule = {
          activity: this.activities.find(activity => activity.name === Store.findColInRow(row, 'activity_name')),
          zoneId: Store.findColInRow(row, 'zone_id'),
          startTime: new Date(Store.findColInRow(row, 'start_time')),
          endTime: new Date(Store.findColInRow(row, 'end_time'))
        }

        const nowTime = Date.now()
        const startTime = schedule.startTime.getTime()
        const endTime = schedule.endTime.getTime()
        schedule.duration = ms2Mins(endTime - startTime)

        const startsIn = ms2Mins(startTime - nowTime)
        const finishedAgo = ms2Mins(nowTime - endTime)
        const minsRemaining = -finishedAgo
        if (startsIn >= 0) {
          schedule.status = 'FUTURE'
          schedule.statusMessage = `Starts in ${startsIn} minutes`
        } else if (nowTime > startTime && nowTime < endTime) {
          schedule.status = 'IN_PROGRESS'
          schedule.statusMessage = `${minsRemaining} minutes remaining`
        } else if (finishedAgo >= 0) {
          schedule.status = 'FINISHED'
          schedule.statusMessage = `Finished ${finishedAgo} minutes ago`
        } else {
          schedule.status = 'FUTURE'
          schedule.statusMessage = '-'
        }

        return schedule
      }).filter(schedule => schedule.status && schedule.status !== 'FINISHED')
        .sort((a, b) => sortByTimeDesc(a.startTime.getTime(), b.startTime.getTime()))
    }
  
    // Then location logs (known by sensor, not person)
    if (database.location_logs) {
      locationLogs = database.location_logs.map(row => ({
        zone: Store.findColInRow(row, 'location'),
        timestamp: new Date(Store.findColInRow(row, 'time')),
        sensor: Store.findColInRow(row, 'sensor_id')
      })).sort((a, b) => sortByTimeAsc(a.timestamp.getTime(), b.timestamp.getTime()))
    }

    // Then sign in records
    if (database.digital_sign_in) {
      signIns = database.digital_sign_in.map(row => {
        const signIn: SignInRecord = {
          personId: Store.findColInRow(row, 'id'),
          arrivalTime: new Date(Store.findColInRow(row, 'arrival_time')),
          endTime: Store.findColInRow(row, 'end_time')
        }

        if (signIn.endTime) {
          signIn.endTime = new Date(signIn.endTime)
        }

        return signIn
      }).sort((a, b) => sortByTimeDesc(a.arrivalTime.getTime(), b.arrivalTime.getTime()))
    }

    // Then notes on people
    if (database.notes) {
      peopleNotes = database.notes.map(row => ({
        id: Store.findColInRow(row, 'id'),
        text: Store.findColInRow(row, 'text'),
        personId: Store.findColInRow(row, 'person_id'),
        name: Store.findColInRow(row, 'name'),
        timestamp: Store.findColInRow(row, 'submitted')
      }))
    }

    // Then emergency contacts for people
    if (database.emergency_contacts) {
      emergencyContacts = database.emergency_contacts.map(row => ({
        personId: Store.findColInRow(row, 'child_id'),
        firstName: Store.findColInRow(row, 'first_name'),
        surname: Store.findColInRow(row, 'surname'),
        email: Store.findColInRow(row, 'email'),
        mobileNumber: Store.findColInRow(row, 'mobile_number'),
        altNumber: Store.findColInRow(row, 'alternative_number')
      }))
    }
  
    // Move onto store values, starting with backup logs
    if (database.backup_log) {
      const backupLogs: BackupLog[] = database.backup_log.map(row => ({
        name: Store.findColInRow(row, 'name'),
        tableName: Store.findColInRow(row, 'table_name'),
        timestamp: new Date(Store.findColInRow(row, 'backup_time')),
        type: Store.findColInRow(row, 'backup_type'),
        description: Store.findColInRow(row, 'description')
      }))

      this.backupLogs = {
        activity: backupLogs.filter(log => log.type === 'Activity'),
        zone: backupLogs.filter(log => log.type === 'Zone'),
        schedule: backupLogs.filter(log => log.type === 'Schedule')
      }
    }

    // Then roles
    if (database.roles) {
      this.roles = database.roles.map(row => ({
        roleTitle: Store.findColInRow(row, 'role_title')
      }))
    }
  
    // Then known sensors
    if (database.sensors) {
      this.sensors = database.sensors.map(row => {
        const sensor: Sensor = { id: Store.findColInRow(row, 'id') }
        
        // Include location logs for this sensor if available
        if (locationLogs) {
          sensor.locations = locationLogs.filter(location => location.sensor === sensor.id)
        }

        return sensor
      })
    }
  
    // Then aggregate to form information about people
    if (database.people) {
      this.people = database.people.map(row => {
        const person: Person = {
          id: Store.findColInRow(row, 'id'),
          firstName: Store.findColInRow(row, 'first_name'),
          surname: Store.findColInRow(row, 'surname'),
          age: Store.findColInRow(row, 'age'),
          responsible: Store.findColInRow(row, 'responsible'),
          // Lookup their role in available roles
          role: this.roles.find(role => role.roleTitle === Store.findColInRow(row, 'role')),
          // Lookup their sensor in available sensors
          sensor: this.sensors.find(sensor => sensor.id === Store.findColInRow(row, 'microbit_id')),
          zoneLocation: null,
          isDependent: Store.findColInRow(row, 'requiresSupport') || false
        }

        if (peopleNotes) {
          person.notes = peopleNotes.filter(note => note.personId === person.id)
        }

        if (emergencyContacts) {
          person.emergencyContacts = emergencyContacts.filter(contact => contact.personId === person.id)
        }

        if (signIns) {
          const nowDate = new Date()
          const thisPersonSignIns = signIns.filter(signIn => signIn.personId === person.id)
          const thisPersonCurrentSignIns = thisPersonSignIns.filter(signIn => signIn.arrivalTime <= nowDate && !signIn.endTime)

          // This person is signed in if they have current sign ins
          person.isSignedIn = thisPersonCurrentSignIns.length > 0

          // Only give this person a last signed in time if they have one or more sign ins
          person.lastSignedIn = null
          if (thisPersonSignIns.length) {
            person.lastSignedIn = thisPersonSignIns[0].arrivalTime
          }
        }

        if (person.sensor && person.sensor.locations && person.sensor.locations.length) {
          const latestLocation = person.sensor.locations[0]
          const wasWithin5Mins = Date.now() - latestLocation.timestamp.getTime() <= ms('5 minutes')

          if (person.isSignedIn && wasWithin5Mins) {
            person.zoneLocation = latestLocation.zone
          }
        }

        return person
      })
    }

    // Then zones
    if (database.zones) {
      this.zones = database.zones.map(row => {
        // Construct minimal zone object
        const zone: Zone = {
          id: Store.findColInRow(row, 'zone_id'),
          roomName: Store.findColInRow(row, 'roomName'),
          maxPeople: Store.findColInRow(row, 'maximum_people'),
          isSafe: Store.findColInRow(row, 'safe_zone') || false,
          isRestricted: Store.findColInRow(row, 'restricted') || false,
          idealResponsibleRatio: [1, 8]
        }
        
        // Include temperatures for this zone if available
        if (tempLogs) {
          zone.temperatures = tempLogs.filter(temp => temp.zone === zone.id)
          if (zone.temperatures.length) {
            zone.temperature = zone.temperatures[0].tempReading
          }
        }
  
        // Include activity schedules happening in this zone if available
        if (activitySchedule) {
          zone.activities = activitySchedule.filter(schedule => schedule.zoneId === zone.id)
        }

        // Calculate which people are in zone based on latest location of each person's sensor
        let responsible = 0, notResponsible = 0, dependent = 0;
        zone.population = this.people.filter(person => {
          if (person.zoneLocation) {
            const personIsInZone = person.zoneLocation === zone.id

            // Also log who's responsible and who's not for ratio calculation
            if (personIsInZone) {
              if (person.responsible) {
                responsible++
              } else {
                notResponsible++
              }

              if (person.isDependent) {
                dependent++
              }
            }

            // Also tell whether they're in a restricted zone and/or safe zone
            person.isInRestrictedZone = personIsInZone && zone.isRestricted

            return personIsInZone
          }

          return false
        })

        // Calculate ratio of responsible:not responsible people in zone
        zone.responsibleRatio = simplifiedRatio(responsible, notResponsible)

        // Calculate average age of zone population
        const avgAge = zone.population
          .map(person => person.age || 0)
          .reduce((prevAge, curAge) => prevAge + curAge, 0) / zone.population.length

        // Generate ideal responsible ratio based on average age
        if (zone.population.length === 0) {
          zone.idealResponsibleRatio = [0, 0]
        } else if (avgAge < 2) {
          zone.idealResponsibleRatio = [1, 3]
        } else if (avgAge >= 2 || avgAge < 3) {
          zone.idealResponsibleRatio = [1, 4]
        }

        // Additionally increase number of staff required in zone for each dependent person
        zone.idealResponsibleRatio[0] += dependent
        const [ x, y ] = zone.idealResponsibleRatio
        zone.idealResponsibleRatio = simplifiedRatio(x, y)

        // Boolean indicating whether this ratio has been violated
        if (zone.responsibleRatio && zone.idealResponsibleRatio && zone.population.length) {
          const responsibleRatio = zone.responsibleRatio[0] / zone.responsibleRatio[1]
          const idealRatio = zone.idealResponsibleRatio[0] / zone.idealResponsibleRatio[1]
          zone.responsibleRatioViolated = responsibleRatio < idealRatio
        }

        return zone
      })
    }

    // Thresholds for notifications
    const minTemp = 18
    const maxTemp = 22

    // Generate list of notifications based on current state of the setting
    // Start with temperature violations in zones
    const zoneTempNotifs: Notification[] = this.zones.filter(zone => {
      if (zone.temperature) {
        const temp = zone.temperature
        return temp < minTemp || temp > maxTemp
      }
    }).map(zone => {
      const temp = zone.temperature
      const violation = temp < minTemp ? `dropped below ${minTemp}°C` : `exceeded ${maxTemp}°C`

      return {
        description: `Temperature in ${zone.roomName} ${violation}`,
        critical: true,
        timestamp: new Date()
      }
    })

    // Then responsible ratio violations in zones
    const zoneRatioNotifs: Notification[] = this.zones.filter(zone => zone.responsibleRatioViolated || false).map(zone => ({
      description: `${zone.roomName} needs more responsible people`,
      critical: false,
      timestamp: new Date()
    }))

    // Then not responsible people in restricted zones
    const notResponsiblePeopleNotifs: Notification[] = this.people.filter(person => person.isInRestrictedZone || false)
      .map(person => {
        const zoneName = this.zones.find(zone => zone.id === person.zoneLocation).roomName

        return {
          description: `${person.firstName} ${person.surname} is in the restricted ${zoneName}`,
          critical: true,
          timestamp: new Date()
        }
      })

    // Then people who are signed in without a location
    const locationlessPeopleNotifs: Notification[] = this.people.filter(person => person.isSignedIn && person.zoneLocation === null)
      .map(person => ({
        description: `${person.firstName} ${person.surname} is signed in but they're not present in the setting`,
        critical: false,
        timestamp: new Date()
      }))
    
    this.notifications = zoneTempNotifs.concat(zoneRatioNotifs, notResponsiblePeopleNotifs, locationlessPeopleNotifs)

    return getActivityTemplates()
      .then(templates => {
        this.activityTemplates = templates
      })
  }

  // Finds the value of a column in a single row
  static findColInRow(row: Row, colName: string) {
    const col = row.find(col => col.metadata.colName === colName)
    if (col) {
      return col.value
    }
    return null
  }

}
