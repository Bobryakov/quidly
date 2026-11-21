/**
 * Сохранить файл на телефон. На Android файл попадает в «Загрузки» (Download),
 * оттуда его можно отправить в Google Диск, Telegram и т. п.
 */
export function downloadFile(data: BlobPart, name: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Можно ли отправить такой файл через меню «Поделиться» телефона. */
export function canShareFile(name: string, mime: string): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], name, { type: mime })] })
  } catch {
    return false
  }
}

/** «Поделиться» файлом. false — человек закрыл меню, ничего не отправив. */
export async function shareFile(data: BlobPart, name: string, mime: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([data], name, { type: mime })], title: name })
    return true
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false
    throw e
  }
}
