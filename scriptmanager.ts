import * as childProcess from 'child_process'
import * as fs from 'fs'
import { ReportType } from './types/scriptmanager'

const execScript = (name: string, args: string[]) => (
  new Promise<string>((resolve, reject) => {
    const params = `"${args.join('" "')}"`
    const cmd = `python3 ${name}.py ${params}`
    if (args[0] !== 'retrieveSchedules') {
      console.log(`Executing ${cmd}`)
    }

    childProcess.exec(cmd, {
      cwd: './scripts'
    }, (err, stdout) => {
      if (err) {
        console.error(`Failed: ${cmd}`)
        reject(err)
      }
      resolve(stdout)
    })
  })
)

export const deleteUser = (userId: number) => execScript('BackupModule', ['reset', 'WIPESPECIFICUSER', userId.toString()])
export const otherFactoryReset = (resetType: string) => execScript('BackupModule', ['reset', resetType])
export const createBackup = (backupType: string, title: string, description: string, zoneId?: number) => {
  const params = [backupType, title.split(' ').join('_'), description]
  if (zoneId) {
    params.push(zoneId.toString())
  }
  return execScript('BackupModule', params)
}
export const loadBackup = (backupType: string, backupName: string, zoneId?: number) => {
  const params = [backupType, backupName]
  if (zoneId) {
    params.push(zoneId.toString())
  }
  return execScript('BackupModule', params)
}

export const createReport = (type: ReportType, start: string, end: string, name: string, entityId: number = 1) => {
  const params = [ type, `'${start}'`, `'${end}'`, name ]
  if (type === 'zoneReport' || type === 'personReport') {
    params.push(entityId.toString())
  }
  params.push('False')

  return new Promise<string>((resolve, reject) => {
    execScript('RepGen', params)
      .then(stdout => {
        const stdoutSplit = stdout.split('/')
        const srcName = stdoutSplit[stdoutSplit.length - 1]
        const destName = srcName
        const srcPath = `scripts/reports/${srcName}`
        const destPath = `/var/www/danmiz.net/html/reports/${destName}`

        fs.copyFile(srcPath, destPath, err => {
          if (err) {
            reject(`Failed to copy file\n\r${err}`)
          }

          fs.unlink(srcPath, err => {
            if (err) {
              console.error(`Failed to delete ${srcPath}`)
            }
          })
          resolve(destName)
        })
      }).catch(err => {
        reject(err)
      })
  })
}

export const getActivityTemplates = () => {
  return execScript('BackupModule', ['retrieveSchedules'])
    .then(str => {
      const arr = str.split('\n')
      return JSON.parse(arr[1])
    })
}
