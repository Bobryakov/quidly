import { buildBackup, TABLES, type BackupData } from '../lib/backup'
import { db, SCHEMA_VERSION } from './db'
import { DEVICE_META, META, setMeta } from './repo'

// Резервная копия и восстановление (этап 8).

/** Все данные из базы. Настройки этого телефона (PIN, отпечаток и т. п.) в копию не входят. */
export async function collectBackupData(): Promise<BackupData> {
  const out = {} as Record<string, unknown[]>
  await db.transaction('r', TABLES, async () => {
    for (const t of TABLES) out[t] = await db.table(t).toArray()
  })
  out.meta = (out.meta as { key: string }[]).filter((m) => !DEVICE_META.includes(m.key))
  return out as unknown as BackupData
}

export async function makeBackupText(password?: string, now = new Date()): Promise<string> {
  return buildBackup(await collectBackupData(), { schemaVersion: SCHEMA_VERSION, password, now })
}

export async function markBackupSaved(now = Date.now()): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    await db.meta.put({ key: META.lastBackupAt, value: now })
    await db.meta.delete(META.backupSnoozeUntil)
  })
}

/** «Позже» у напоминания — напомнить через сутки. */
export async function snoozeBackupReminder(now = Date.now()): Promise<void> {
  await setMeta(META.backupSnoozeUntil, now + 86_400_000)
}

/**
 * Заменить все данные данными из копии — одним действием:
 * если что-то пойдёт не так, база останется как была.
 * PIN, отпечаток и дата последней копии этого телефона сохраняются.
 */
export async function restoreBackupData(data: BackupData): Promise<void> {
  await db.transaction('rw', TABLES, async () => {
    const keep = (await db.meta.bulkGet([...DEVICE_META])).filter((m) => m !== undefined)
    for (const t of TABLES) await db.table(t).clear()
    for (const t of TABLES) {
      const rows = t === 'meta' ? data.meta.filter((m) => !DEVICE_META.includes(m.key)) : data[t]
      if (rows.length) await db.table(t).bulkAdd(rows)
    }
    if (keep.length) await db.meta.bulkPut(keep)
  })
}
