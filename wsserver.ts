import * as fs from 'fs'
import WebSocket from 'ws'
import jwt from 'jsonwebtoken'
import ms from 'ms'

import * as db from './db'
import Store from './store'
import * as scriptManager from './scriptmanager'
import { Packet, AuthPacket, QueryPacket, LiveUpdatePacket, WSClient, TokenPacket, AuthSuccessPacket, CreateBackupPacket, LoadBackupPacket, ZoneReportPacket, SettingReportPacket, CreateThemePacket, ActivateThemePacket, FactoryResetPacket, PersonReportPacket } from './types/wsserver'
import { ReportType } from './types/scriptmanager'
import { Theme } from './types/store'
import { ColumnValue } from 'tedious'

// Constants
const CLIENT_PORT = 3413
const REPORT_ENDPOINT = 'https://danmiz.net/reports'
const jwtSecret = fs.readFileSync('./.jwtsecret', 'utf8')
const addZero = (n: number) => n < 10 ? '0' + n : n.toString()
const convertDate = (d: Date) => `${d.getFullYear()}-${addZero(d.getMonth())}-${addZero(d.getDate())}`

export default class WSServer {
  socket: WebSocket.Server
  authedClients: WSClient[]
  store: Store
  port: number

  constructor(store: Store) {
    this.socket = new WebSocket.Server({ port: CLIENT_PORT })
    this.authedClients = []
    this.store = store
    this.port = CLIENT_PORT

    this.socket.on('connection', (client) => {
      console.log(`Connected to client #${this.socket.clients.size}`)

      client.on('message', data => {
        this.onClientMessage(client, data)
      })
  
      client.on('close', () => console.log(`Client disconnected; ${this.socket.clients.size} client(s) remaining`))
    })
  }

  async onClientMessage(client: WebSocket, msg: WebSocket.Data) {
    let data: Packet
    try {
      data = JSON.parse(msg.toString())
      if (!data.type) {
        return
      }
    } catch {
      return
    }

    // Function to generate and send a report to the current client
    const generateAndSendReport = (type: ReportType, start: string, end: string, reportName: string, entityId?: number) => {
      const startDate = convertDate(new Date(start))
      const endDate = convertDate(new Date(end))

      scriptManager.createReport(type, startDate, endDate, reportName, entityId || 1)
        .then(fileName => {
          this.sendTo(client, {
            type: 'REPORT_GENERATED',
            location: `${REPORT_ENDPOINT}/${fileName}`
          })
        }).catch(err => {
          console.error(`Generating ${reportName} failed\n\r${err}`)
          this.sendTo(client, {
            type: 'REPORT_FAILED'
          })
        })
    }
    
    if (data.type === 'AUTH') {
      let packet = data as AuthPacket
      
      this.auth(client, packet)
        .then(async token => {
          const queryResult = await this.queryDb('SELECT * FROM themes ORDER BY theme_name;')
          const themes = this.generateThemes(queryResult)

          const successPacket: AuthSuccessPacket = {
            type: 'AUTH_SUCCESS',
            token,
            entities: this.store,
            themes
          }
          this.sendTo(client, successPacket)
        }).catch(() => this.sendTo(client, { type: 'AUTH_FAILED' }))
    } else {
      let tokenPacket = data as AuthSuccessPacket

      if (tokenPacket.token) {
        const isAuthed = await this.isAuthed(tokenPacket)
        if (!isAuthed) {
          return
        }
      }
    }

    if (data.type === 'QUERY') {
      let packet = data as QueryPacket

      if (packet.query) {
        this.queryDb(packet.query)
          .then(() => {
            this.liveUpdateTo(client)
          })
      }
    }

    if (data.type === 'CREATE_BACKUP') {
      let packet = data as CreateBackupPacket

      if (packet.backupType && packet.title && packet.description) {
        if (packet.backupType === 'saveSchedule') {
          if (packet.zoneId) {
            console.log(`GOT ${packet.type}: ${packet.title}`)
            scriptManager.createBackup(packet.backupType, packet.title, packet.description, packet.zoneId)
          }
        } else {
          console.log(`GOT ${packet.type}: ${packet.title}`)
          scriptManager.createBackup(packet.backupType, packet.title, packet.description)
        }
      }
    }

    if (data.type === 'LOAD_BACKUP') {
      let packet = data as LoadBackupPacket

      if (packet.backupType && packet.backupName) {
        if (packet.backupType === 'loadSchedule') {
          if (packet.zoneId) {
            console.log(`GOT ${packet.type}: ${packet.backupName}`)
            scriptManager.loadBackup(packet.backupType, packet.backupName, packet.zoneId)
          }
        } else {
          console.log(`GOT ${packet.type}: ${packet.backupName}`)
          scriptManager.loadBackup(packet.backupType, packet.backupName)
        }
      }
    }

    if (data.type === 'ZONE_REPORT') {
      let packet = data as ZoneReportPacket

      if (packet.start && packet.end && packet.name && packet.zoneId) {
        generateAndSendReport('zoneReport', packet.start, packet.end, packet.name, packet.zoneId)
      }
    }

    if (data.type === 'PERSON_REPORT') {
      let packet = data as PersonReportPacket

      if (packet.name && packet.personId) {
        const start = new Date()
        start.setDate(start.getDate() - 7)
        const end = new Date()

        generateAndSendReport('personReport', convertDate(start), convertDate(end), packet.name, packet.personId)
      }
    }

    if (data.type === 'SETTING_REPORT') {
      let packet = data as SettingReportPacket

      if (packet.start && packet.end && packet.name) {
        generateAndSendReport('settingReport', packet.start, packet.end, packet.name)
      }
    }

    if (data.type === 'ACTIVATE_THEME') {
      let packet = data as ActivateThemePacket
      
      if (packet.themeId) {
        this.queryDb(`
          IF EXISTS(SELECT id FROM themes WHERE id = ${packet.themeId})
            UPDATE themes SET is_active = 0 WHERE is_active = 1
            UPDATE themes SET is_active = 1 WHERE id = ${packet.themeId};
          SELECT * FROM themes ORDER BY theme_name;
        `).then(queryResult => {
            this.broadcastThemes(queryResult)
          })
      }
    }

    if (data.type === 'CREATE_THEME') {
      let packet = data as CreateThemePacket

      if (packet.bgColor && packet.companyLogo && packet.companyName && packet.containerColor && packet.headerColor && packet.name && packet.setActive !== undefined && packet.sidebarColor) {
        const query = `
          ${packet.setActive ? 'UPDATE themes SET is_active = 0 WHERE is_active = 1;' : ''}
          INSERT INTO themes (bg_color, company_logo, company_name, container_color, header_color, theme_name, is_active, sidebar_color)
            VALUES ('${packet.bgColor}', '${packet.companyLogo}', '${packet.companyName}', '${packet.containerColor}', '${packet.headerColor}', '${packet.name}', ${packet.setActive ? 1 : 0}, '${packet.sidebarColor}');
          SELECT * FROM themes ORDER BY theme_name;
        `
        const queryResult = await this.queryDb(query)
        this.broadcastThemes(queryResult)
      }
    }

    if (data.type === 'FACTORY_RESET') {
      let packet = data as FactoryResetPacket

      if (packet.resetType === 'WIPESPECIFICUSER' && packet.userId) {
        await scriptManager.deleteUser(packet.userId)
      } else if (packet.resetType) {
        await scriptManager.otherFactoryReset(packet.resetType)
      }
    }
  }

  // Auth a new client if their password is correct
  async auth(client: WebSocket, packet: AuthPacket) {
    const conn = await db.connect()
    
    // TODO: make this a prepared statement to prevent SQL injection, duh
    const queryString = `SELECT id, password FROM users WHERE username = '${packet.username}';`
    const users = await db.query(conn, queryString)
    
    // TODO: hash passwords, ya dummy
    if (users && users.length) {
      const [ userId, password ] = users[0]
      const shouldAuth = password.value === packet.password
      if (shouldAuth) {
        const expiresIn = '30 days' // dev
        const token = jwt.sign({ userId: userId.value }, jwtSecret, { expiresIn })

        this.authedClients.push({
          socket: client,
          expiresIn,
          userId: userId.value
        })

        return token
      }
    }

    throw Error('Failed to auth client')
  }

  async isAuthed(packet: TokenPacket) {
    let payload
    try {
      payload = jwt.verify(packet.token, jwtSecret)
    } catch (e) {
      return false
    }
    
    if (!payload.userId) {
      try {
        payload = JSON.parse(payload)
      } catch (e) {
        return false
      }
    }

    if (payload.userId) {
      /*const uid = payload.userId
      const conn = await db.connect()

      const queryString = `SELECT COUNT(*) FROM users WHERE id = ${uid}`
      const data = await db.query(conn, queryString)

      const exists = data.length && data[0].length && data[0][0].value > 0
      return exists*/

      return true
    } else {
      return false
    }
  }

  // Broadcast the store to all authenticated, connected clients
  // Also prune list of authed clients
  broadcastStore() {
    this.authedClients = this.authedClients.filter(client => {
      const isAuthedAndConnected = (
        ms(client.expiresIn) <= Date.now()
        && client.socket.readyState === WebSocket.OPEN
      )
      if (isAuthedAndConnected) {
        this.liveUpdateTo(client.socket)
      }

      return isAuthedAndConnected
    })
  }

  liveUpdateTo(client: WebSocket) {
    const packet: LiveUpdatePacket = {
      type: 'LIVE_UPDATE',
      entities: this.store
    }
    this.sendTo(client, packet)
  }

  broadcastThemes(queryResult: ColumnValue[][]) {
    if (queryResult && queryResult.length) {
      const themes: Theme[] = this.generateThemes(queryResult)
      this.broadcast({ type: 'THEME_CHANGED', themes })
    }
  }

  generateThemes(queryResult: ColumnValue[][]) {
    const themes: Theme[] = queryResult.map(row => ({
      id: Store.findColInRow(row, 'id'),
      name: Store.findColInRow(row, 'theme_name'),
      bgColor: Store.findColInRow(row, 'bg_color'),
      companyLogo: Store.findColInRow(row, 'company_logo'),
      companyName: Store.findColInRow(row, 'company_name'),
      containerColor: Store.findColInRow(row, 'container_color'),
      headerColor: Store.findColInRow(row, 'header_color'),
      isActive: Store.findColInRow(row, 'is_active'),
      sidebarColor: Store.findColInRow(row, 'sidebar_color'),
      createdAt: Store.findColInRow(row, 'created_at')
    }))
    return themes
  }

  broadcast(data: any) {
    this.authedClients.forEach(client => {
      this.sendTo(client.socket, data)
    })
  }

  sendTo(client: WebSocket, data: any) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data))
    }
  }

  // Execute as a DB query the string received from a client
  async queryDb(queryString: QueryPacket['query']) {
    const conn = await db.connect()

    try {
      const res = await db.query(conn, queryString)
      return res
    } catch (err) {
      console.error(`Query failed:\n\t${queryString}\n\t${err.message || err}`)
    }
  }
}
