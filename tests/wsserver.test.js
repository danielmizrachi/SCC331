const https = require('https')
const WebSocket = require('ws')

const connectAndAuth = (username, password) => {
  const ws = new WebSocket('wss://danmiz.net/331dev')

  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'AUTH',
      username: username || 'jest',
      password: password || 'wHBSx^2_*x>tYLS+'
    }))
  })

  return ws
}
const generateReport = packetType => async () => {
  expect.assertions(1)

  const handler = new Promise((resolve, reject) => {
    const ws = connectAndAuth()

    ws.on('message', msg => {
      let data
      try {
        data = JSON.parse(msg)
      } catch {
        reject()
      }
      
      if (data.type === 'AUTH_SUCCESS') {
        const token = data.token
        const start = new Date()
        start.setDate(start.getDate() - 1)
        const end = new Date()
        const zoneId = Math.min(...data.entities.zones.map(zone => zone.id))

        const packet = {
          type: packetType,
          token, start, end, zoneId,
          name: 'JestReport'
        }

        ws.send(JSON.stringify(packet))
      } else if(data.type === 'AUTH_FAILED') {
        ws.close()
        reject()
      } else if (data.type === 'REPORT_GENERATED') {
        ws.close()
        https.get(data.location, res => {
          resolve(res.statusCode)
        })
      } else if (data.type === 'REPORT_FAILED') {
        ws.close()
        reject()
      }
    })
  })

  await expect(handler).resolves.toEqual(200)
}

test('doesn\'t auth with invalid username/password', done => {
  expect.assertions(1)

  const ws = connectAndAuth('notausername', 'notapassword')

  ws.on('message', msg => {
    const data = JSON.parse(msg)
    expect(data.type).toBe('AUTH_FAILED')
    ws.close()
    done()
  })
}, 10000)
test('generates report in response to SETTING_REPORT packet', generateReport('SETTING_REPORT'), 10000)
test('generates report in response to ZONE_REPORT packet', generateReport('ZONE_REPORT'), 10000)
test('changes the theme in response to ACTIVATE_THEME packet', done => {
  expect.assertions(1)

  const ws = connectAndAuth()
  let themeId

  ws.on('message', msg => {
    let data
    try {
      data = JSON.parse(msg)
    } catch {
      reject()
    }

    if (data.type === 'AUTH_SUCCESS') {
      if (data.themes.length) {
        themeId = data.themes[0].id
        ws.send(JSON.stringify({
          type: 'ACTIVATE_THEME',
          themeId
        }))
      } else {
        reject('NO THEMES')
      }
    }

    if (data.type === 'THEME_CHANGED') {
      const activeThemeId = data.themes.find(theme => theme.isActive).id
      expect(themeId === activeThemeId).toBe(true)
      ws.close()
      done()
    }
  })
}, 10000)
