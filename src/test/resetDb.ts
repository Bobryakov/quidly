import { db } from '../db/db'

/** Чистая база со стартовыми категориями — перед каждым тестом. */
export async function resetDb() {
  db.close()
  await db.delete()
  await db.open()
}
