import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { AlertTriangle, Crop, Move, RotateCcw, RotateCw, Scissors, X } from 'lucide-react'
import {
  clampCrop,
  defaultReceiptCrop,
  renderProcessedReceiptImage,
  type CropPercent,
  type ImageProcessingMetadata,
} from '../lib/imagePreprocess'

interface ReceiptCropModalProps {
  file: File
  queueCount: number
  disabled?: boolean
  title?: string
  description?: string
  skipLabel?: string
  confirmLabel?: string
  qualityWarning?: {
    title: string
    body: string
  } | null
  labels?: any
  onCancel: () => void
  onConfirm: (result: { processedFile: File | null; imageProcessing: ImageProcessingMetadata | null }) => void
  onError: (message: string) => void
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'
type ReceiptRotation = 0 | 90 | 180 | 270
type RotationDirection = 'left' | 'right'

interface DragState {
  mode: DragMode
  startX: number
  startY: number
  startCrop: CropPercent
}

export function nextReceiptRotation(current: ReceiptRotation, direction: RotationDirection): ReceiptRotation {
  return ((current + (direction === 'left' ? 270 : 90)) % 360) as ReceiptRotation
}

export function getReceiptRotationStyle(rotation: ReceiptRotation) {
  return {
    transform: `rotate(${rotation}deg)`,
  }
}

export function ReceiptCropModal({
  file,
  queueCount,
  disabled = false,
  title = '解析前裁剪',
  description = '让票据主体尽量占满识别图，减少桌面、信封、背景纸张进入解析输入。',
  skipLabel = '跳过裁剪',
  confirmLabel = '应用裁剪并上传',
  qualityWarning = null,
  labels,
  onCancel,
  onConfirm,
  onError,
}: ReceiptCropModalProps) {
  const [imageUrl, setImageUrl] = useState('')
  const [crop, setCrop] = useState<CropPercent>(() => defaultReceiptCrop())
  const [rotation, setRotation] = useState<ReceiptRotation>(0)
  const [isRendering, setIsRendering] = useState(false)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setCrop(defaultReceiptCrop())
    setRotation(0)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const cropStyle = useMemo(() => ({
    left: `${crop.x}%`,
    top: `${crop.y}%`,
    width: `${crop.width}%`,
    height: `${crop.height}%`,
  }), [crop])
  const previewRotationStyle = useMemo(() => getReceiptRotationStyle(rotation), [rotation])

  const handlePointerDown = (event: PointerEvent, mode: DragMode) => {
    if (disabled || isRendering) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startCrop: crop,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent) => {
    const drag = dragRef.current
    const preview = previewRef.current
    if (!drag || !preview) return

    const rect = preview.getBoundingClientRect()
    const dx = ((event.clientX - drag.startX) / rect.width) * 100
    const dy = ((event.clientY - drag.startY) / rect.height) * 100
    const next = { ...drag.startCrop }

    if (drag.mode === 'move') {
      next.x += dx
      next.y += dy
    } else {
      if (drag.mode.includes('w')) {
        next.x += dx
        next.width -= dx
      }
      if (drag.mode.includes('e')) {
        next.width += dx
      }
      if (drag.mode.includes('n')) {
        next.y += dy
        next.height -= dy
      }
      if (drag.mode.includes('s')) {
        next.height += dy
      }
    }

    setCrop(clampCrop(next))
  }

  const handlePointerUp = (event: PointerEvent) => {
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Pointer may already be released when the drag leaves the handle.
    }
  }

  const handleApply = async () => {
    try {
      setIsRendering(true)
      const processed = await renderProcessedReceiptImage(file, crop, rotation)
      onConfirm({
        processedFile: processed.file,
        imageProcessing: processed.metadata,
      })
    } catch (error) {
      onError(error instanceof Error ? error.message : labels?.cropFailedLabel || '图片裁剪失败')
    } finally {
      setIsRendering(false)
    }
  }

  const formatQueuedCount = (count: number) => {
    if (typeof labels?.queuedCountLabel === 'function') return labels.queuedCountLabel(count)
    return `${count} 张待处理`
  }

  const formatRotation = (degrees: ReceiptRotation) => {
    if (typeof labels?.rotationLabel === 'function') return labels.rotationLabel(degrees)
    return `照片与输出旋转：${degrees}°`
  }

  const formatResizeLabel = (mode: DragMode) => {
    if (typeof labels?.resizeCropLabel === 'function') return labels.resizeCropLabel(mode)
    return `resize ${mode}`
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-600">
              <Crop className="h-4 w-4" />
              {title}
              {queueCount > 1 && <span className="rounded-md bg-indigo-50 px-2 py-1 text-[10px]">{formatQueuedCount(queueCount)}</span>}
            </div>
            <p className="mt-1 truncate text-sm font-black text-slate-900">{file.name}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled || isRendering}
            className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
            title={labels?.cancelCropLabel || '取消本张'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_280px]">
          <div className="min-h-0 overflow-auto bg-slate-100 p-4 lg:p-6">
            <div className="flex min-h-[56vh] items-center justify-center">
              <div
                ref={previewRef}
                className="relative inline-block max-h-[66vh] max-w-full select-none touch-none shadow-xl transition-transform duration-200"
                style={previewRotationStyle}
                data-rotation={rotation}
              >
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt={labels?.cropPreviewAlt || 'Receipt crop preview'}
                    className="block max-h-[66vh] max-w-full rounded-lg bg-white object-contain"
                    draggable={false}
                  />
                )}
                <div className="absolute inset-0 rounded-lg bg-slate-950/35" />
                <div
                  className="absolute border-2 border-indigo-500 bg-indigo-500/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]"
                  style={cropStyle}
                  onPointerDown={(event) => handlePointerDown(event, 'move')}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase text-slate-700 shadow">
                    <Move className="h-3.5 w-3.5" />
                    {labels?.dragCropLabel || '拖动票据区域'}
                  </div>
                  {(['nw', 'ne', 'sw', 'se'] as DragMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-label={formatResizeLabel(mode)}
                      className={`absolute h-5 w-5 rounded-full border-2 border-white bg-indigo-600 shadow ${
                        mode === 'nw' ? '-left-2.5 -top-2.5 cursor-nwse-resize' :
                        mode === 'ne' ? '-right-2.5 -top-2.5 cursor-nesw-resize' :
                        mode === 'sw' ? '-bottom-2.5 -left-2.5 cursor-nesw-resize' :
                        '-bottom-2.5 -right-2.5 cursor-nwse-resize'
                      }`}
                      onPointerDown={(event) => handlePointerDown(event, mode)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-4 border-l border-slate-100 bg-white p-5">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{labels?.cropTargetLabel || '处理目标'}</p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
                {description}
              </p>
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-indigo-600">{formatRotation(rotation)}</p>
            </div>

            {qualityWarning && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest">{qualityWarning.title}</p>
                    <p className="mt-1 text-xs font-bold leading-5">{qualityWarning.body}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRotation((current) => nextReceiptRotation(current, 'left'))}
                disabled={disabled || isRendering}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {labels?.rotateLeftLabel || '左转照片'}
              </button>
              <button
                type="button"
                onClick={() => setRotation((current) => nextReceiptRotation(current, 'right'))}
                disabled={disabled || isRendering}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCw className="h-4 w-4" />
                {labels?.rotateRightLabel || '右转照片'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setCrop(defaultReceiptCrop())
                setRotation(0)
              }}
              disabled={disabled || isRendering}
              className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {labels?.resetCropLabel || '重置裁剪框'}
            </button>

            <div className="mt-auto space-y-3">
              <button
                type="button"
                onClick={() => onConfirm({ processedFile: null, imageProcessing: null })}
                disabled={disabled || isRendering}
                className="w-full rounded-2xl bg-slate-100 px-4 py-4 text-xs font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
              >
                {skipLabel}
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={disabled || isRendering}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-500 disabled:opacity-50"
              >
                <Scissors className="h-4 w-4" />
                {isRendering ? labels?.renderingLabel || '正在处理' : confirmLabel}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
