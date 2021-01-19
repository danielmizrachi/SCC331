// Dependencies
import * as fs from 'fs'
import * as db from './db'
import Store from './store'
import WSServer from './wsserver'

// Period at which
const LIVE_PERIOD = 2000

// Create cached store of calculated values from DB
const store = new Store()

// Alias useful functions
const log = (msg: any) => process.stdout.write(msg)
const logln = console.log

// Run the server
const run = () => {
  // Initialise a WebSocket for clients to connect to
  log('Initialising WebSocket... ')
  const wsServer = new WSServer(store)
  logln('Done.')
  logln(`WebSocket server listening on port ${wsServer.port}`)

  setInterval(() => {
    db.connectAndQuery()
      .then(database => store.buildFromDb(database))
      .then(() => wsServer.broadcastStore())
      .catch(err => console.error(`\n${err}`))
  }, LIVE_PERIOD)
}

console.clear()
if (!fs.existsSync('./.jwtsecret')) {
  console.error('No .jwtsecret file found, exiting')
  process.exit()
}
log('Connecting to and querying database... ')
db.connectAndQuery()
  .then(database => store.buildFromDb(database))
  .then(() => logln('Done.'))
  .then(() => run())
  .catch(err => console.error(`\n${err}`))
