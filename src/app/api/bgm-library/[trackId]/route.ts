import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUserAuth, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * DELETE /api/bgm-library/[trackId]
 * 软删除（设置 isActive = false）
 */
export const DELETE = apiHandler(async (
  _request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const { trackId } = await params

  const track = await prisma.bgmLibraryTrack.findUnique({ where: { id: trackId } })
  if (!track) throw new ApiError('NOT_FOUND')

  await prisma.bgmLibraryTrack.update({
    where: { id: trackId },
    data: { isActive: false },
  })

  return NextResponse.json({ success: true })
})

/**
 * PATCH /api/bgm-library/[trackId]
 * 更新排序或元数据
 */
export const PATCH = apiHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const { trackId } = await params
  const body = await request.json()
  const { sortOrder, title, artist, genre, mood } = body

  const track = await prisma.bgmLibraryTrack.findUnique({ where: { id: trackId } })
  if (!track) throw new ApiError('NOT_FOUND')

  const updated = await prisma.bgmLibraryTrack.update({
    where: { id: trackId },
    data: {
      ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      ...(title !== undefined && { title }),
      ...(artist !== undefined && { artist }),
      ...(genre !== undefined && { genre }),
      ...(mood !== undefined && { mood }),
    },
  })

  return NextResponse.json({ track: updated })
})
