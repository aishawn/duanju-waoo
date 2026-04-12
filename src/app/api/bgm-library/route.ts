import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { getSignedUrl } from '@/lib/storage/signed-urls'

/**
 * GET /api/bgm-library
 * 获取BGM曲库列表，支持 genre / mood 筛选
 */
export const GET = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const genre = searchParams.get('genre')
  const mood = searchParams.get('mood')
  const search = searchParams.get('q')?.trim()

  const where: Record<string, unknown> = { isActive: true }
  if (genre) where.genre = genre
  if (mood) where.mood = mood
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { artist: { contains: search } },
    ]
  }

  const tracks = await prisma.bgmLibraryTrack.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      artist: true,
      genre: true,
      mood: true,
      durationMs: true,
      storageKey: true,
      waveformData: true,
      sortOrder: true,
    },
  })

  // 为每条曲目生成签名播放URL（有效期1小时）
  const tracksWithUrl = await Promise.all(
    tracks.map(async (track) => {
      let playUrl: string | null = null
      try {
        playUrl = await getSignedUrl(track.storageKey, 3600)
      } catch {
        // 静默失败，客户端会显示无法播放
      }
      return {
        id: track.id,
        title: track.title,
        artist: track.artist,
        genre: track.genre,
        mood: track.mood,
        durationMs: track.durationMs,
        waveformData: track.waveformData ? JSON.parse(track.waveformData) : null,
        playUrl,
      }
    })
  )

  return NextResponse.json({ tracks: tracksWithUrl })
})

/**
 * POST /api/bgm-library
 * 管理员上传新曲目元数据（storageKey 须已上传到 MinIO）
 */
export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json()
  const { title, artist, genre, mood, durationMs, storageKey, waveformData, sortOrder } = body

  if (!title || !genre || !mood || !durationMs || !storageKey) {
    throw new ApiError('INVALID_PARAMS')
  }

  const track = await prisma.bgmLibraryTrack.create({
    data: {
      title,
      artist: artist ?? null,
      genre,
      mood,
      durationMs: Number(durationMs),
      storageKey,
      waveformData: waveformData ? JSON.stringify(waveformData) : null,
      sortOrder: sortOrder ?? 0,
    },
  })

  return NextResponse.json({ track }, { status: 201 })
})
