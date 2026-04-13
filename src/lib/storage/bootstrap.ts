import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { createStorageProvider } from '@/lib/storage/factory'
import type { StorageFactoryOptions } from '@/lib/storage/types'
import { requireEnv } from '@/lib/storage/utils'

const DEFAULT_MINIO_REGION = 'us-east-1'

export type StorageBootstrapResult = 'skipped' | 'existing' | 'created'

type BucketErrorShape = {
  name?: string
  message?: string
  code?: string
  Code?: string
  $metadata?: {
    httpStatusCode?: number
    requestId?: string
  }
}

function summarizeEndpointForLog(endpoint: string): string {
  try {
    const u = new URL(endpoint)
    return `${u.protocol}//${u.host}`
  } catch {
    return '(invalid MINIO_ENDPOINT URL — include https:// or http://)'
  }
}

function formatBootstrapFailureHint(params: {
  endpoint: string
  region: string
  bucket: string
  error: unknown
}): string {
  const { endpoint, region, bucket, error } = params
  const e = error as BucketErrorShape
  const status = e.$metadata?.httpStatusCode
  const code = e.code || e.Code || e.name || ''
  const reqId = e.$metadata?.requestId
  const base = summarizeEndpointForLog(endpoint)
  const tail = [
    `endpoint=${base}`,
    `region=${region}`,
    `bucket=${bucket}`,
    status != null ? `httpStatus=${status}` : null,
    code ? `code=${code}` : null,
    reqId ? `requestId=${reqId}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  const hints = [
    'Confirm MINIO_ENDPOINT is the S3 API base URL (e.g. https://<id>.r2.cloudflarestorage.com for R2, or your MinIO URL), not a public CDN/custom domain.',
    'For Cloudflare R2 use MINIO_REGION=auto and MINIO_FORCE_PATH_STYLE=true unless your provider docs say otherwise.',
    'If the bucket is created in the provider UI and policies are strict, ensure keys can HeadBucket / CreateBucket.',
  ]

  return `[storage:init] S3 HeadBucket/CreateBucket failed (${tail}). ${hints.join(' ')}`
}

function isMissingBucketError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const bucketError = error as BucketErrorShape
  const errorName = bucketError.name || ''
  const errorCode = bucketError.code || bucketError.Code || ''
  const statusCode = bucketError.$metadata?.httpStatusCode

  return errorName === 'NotFound'
    || errorCode === 'NotFound'
    || errorCode === 'NoSuchBucket'
    || statusCode === 404
}

export async function ensureMinioBucket(): Promise<Exclude<StorageBootstrapResult, 'skipped'>> {
  const endpoint = requireEnv('MINIO_ENDPOINT')
  const accessKeyId = requireEnv('MINIO_ACCESS_KEY')
  const secretAccessKey = requireEnv('MINIO_SECRET_KEY')
  const bucket = requireEnv('MINIO_BUCKET')
  const region = (process.env.MINIO_REGION || DEFAULT_MINIO_REGION).trim() || DEFAULT_MINIO_REGION
  const forcePathStyle = process.env.MINIO_FORCE_PATH_STYLE !== 'false'

  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return 'existing'
  } catch (error: unknown) {
    if (!isMissingBucketError(error)) {
      console.error(formatBootstrapFailureHint({ endpoint, region, bucket, error }))
      throw error
    }
  }

  try {
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
    return 'created'
  } catch (error: unknown) {
    console.error(formatBootstrapFailureHint({ endpoint, region, bucket, error }))
    throw error
  }
}

export async function ensureStorageReady(options: StorageFactoryOptions = {}): Promise<StorageBootstrapResult> {
  const provider = createStorageProvider(options)

  if (provider.kind !== 'minio') {
    return 'skipped'
  }

  return await ensureMinioBucket()
}
