/** Перезапуск приложения (вынесен отдельно, чтобы в тестах его можно было подменить). */
export const appControl = {
  reload() {
    window.location.reload()
  },
}
