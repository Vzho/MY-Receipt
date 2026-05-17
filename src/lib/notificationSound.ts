import type { AppNotificationInput } from './appNotifications'

type AudioContextLike = AudioContext & { webkitAudioContext?: typeof AudioContext }

export function shouldPlayNotificationSound(notification: AppNotificationInput): boolean {
  if (notification.type === 'error' || notification.type === 'warning') return true

  const title = notification.title.toLowerCase()
  return notification.type === 'success' && (
    title.includes('batch')
    || title.includes('pdf upload')
    || title.includes('ocr finished')
  )
}

export function playNotificationSound(enabled: boolean, notification: AppNotificationInput) {
  if (!enabled || !shouldPlayNotificationSound(notification)) return
  playShortBeep(notification.type === 'error' ? 220 : notification.type === 'warning' ? 330 : 520)
}

function playShortBeep(frequency: number) {
  try {
    const AudioCtor = globalThis.AudioContext || (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return

    const context = new AudioCtor() as AudioContextLike
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.2)
    window.setTimeout(() => {
      void context.close()
    }, 260)
  } catch {
    // Browsers can block audio until user interaction; notification sound is best-effort.
  }
}
