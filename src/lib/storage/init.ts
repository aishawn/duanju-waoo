import { ensureStorageReady } from '@/lib/storage/bootstrap'
import { requireEnv } from '@/lib/storage/utils'

function isTruthySkip(value: string | undefined): boolean {
  const v = (value || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

async function main() {
  if (isTruthySkip(process.env.STORAGE_INIT_SKIP)) {
    console.warn('[storage:init] skipped (STORAGE_INIT_SKIP is set); bucket is not verified at startup')
    return
  }

  const result = await ensureStorageReady()

  if (result === 'skipped') {
    return
  }

  const bucket = requireEnv('MINIO_BUCKET')
  if (result === 'created') {
    console.log(`[storage:init] created MinIO bucket "${bucket}"`)
    return
  }

  console.log(`[storage:init] verified MinIO bucket "${bucket}"`)
}

void main().catch((error: unknown) => {
  console.error('[storage:init] failed to prepare storage')
  console.error(error)
  process.exit(1)
})
