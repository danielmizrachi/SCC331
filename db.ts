import fs from 'fs'
import { Connection, Request, ColumnValue, ConnectionConfig } from 'tedious'
import { TableName, Database } from './types/db'

if (!fs.existsSync('./.dbpass')) {
  console.error('No .dbpass file found, exiting')
  process.exit()
}

const dbPass = fs.readFileSync('.dbpass').toString()
const connectionOptions: ConnectionConfig = {
  authentication: {
    options: {
      userName: 'serveradmin',
      password: dbPass,
    },
    type: 'default'
  },
  server: 'sprint4server.database.windows.net',
  options: {
    database: 'sprint4db',
    encrypt: true,
    rowCollectionOnDone: true
  }
}

export const connect = () => {
  // Init connection
  const conn = new Connection(connectionOptions)

  conn.on('error', err => console.error(`DB connection error:\n\t${err}`))
  conn.on('end', () => {})

  // Promise a connection
  return new Promise<Connection>(resolve => {
    conn.on('connect', (err) => {
      if (err) {
        console.error(`Error connecting to DB: ${err.message}`)
        console.info('Exiting...')
        process.exit()
      } else {
        resolve(conn)
      }
    })
  })
}

// Query the DB given a connection object
export const query = (conn: Connection, queryString: string, doClose = true) => (
  new Promise<ColumnValue[][]>((resolve, reject) => {
    const data = []
    const req = new Request(queryString, err => {
      if (err) {
        reject(err)
      }
    })

    req.on('row', cols => {
      data.push(cols)
    })

    
    req.on('requestCompleted', () => {
      if (doClose) {
        conn.close()
      }
      resolve(data)
    })

    conn.execSql(req)
  })
)

// Execute query with which to populate local store
export const queryAll = (conn: Connection) => {
  // The tables that will be selected in the following request
  const tablesToSelect: TableName[] = [ 'activities', 'activity_schedule', 'backup_log', 'digital_sign_in', 'emergency_contacts', 'location_logs', 'notes', 'people', 'roles', 'sensors', 'temperature_logs', 'zones' ]

  // A store for the database
  const database: Database = {}

  // Populates the database model for each table received
  const gotTable = (rowCount, more, rows: ColumnValue[][]) => {
    const selectedTable = tablesToSelect.shift()
    database[selectedTable] = rows
  }

  return new Promise<Database>((resolve, reject) => {
    const queryString = tablesToSelect.map(table => `SELECT * FROM ${table};`).join('\n')
    const req = new Request(queryString, err => {
      if (err) {
        console.error(`Error in query: ${err}`)
        reject(err)
      } else {
        resolve(database)
      }
    })

    // Await data from each table
    req.on('done', gotTable)
    req.on('doneInProc', gotTable)

    // Close DB connection once request complete
    req.on('requestCompleted', () => conn.close())

    // Asynchronously execute the request
    conn.execSql(req)
  })
}

// Connect to and query the DB
export const connectAndQuery = () => (
  new Promise<Database>((resolve, reject) => {
    connect()
      .then(conn => queryAll(conn))
      .then(database => resolve(database))
      .catch(err => reject(err))
  })
)
