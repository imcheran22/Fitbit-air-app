import { useState } from 'react'
import { setSitePassword } from '../lib/dataSource'
import { TEXT, type Lang } from '../lib/i18n'
import Icon from './Icon'

interface Props {
  lang: Lang
  /** true tras un intento fallido, para mostrar el mensaje de error */
  failed: boolean
  onSubmit: () => void
}

export default function PasswordGate({ lang, failed, onSubmit }: Props) {
  const copy = TEXT[lang]
  const [pw, setPw] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pw.trim()) return
    setSitePassword(pw.trim())
    onSubmit()
  }

  return (
    <div className="grid min-h-svh place-items-center p-6">
      <form onSubmit={submit} className="panel w-full max-w-xs p-7 text-center">
        <div
          className="mx-auto grid h-12 w-12 place-items-center rounded-xl glow-solar"
          style={{ background: 'var(--color-elevated)' }}
        >
          <Icon name="gauge" size={24} className="text-solar-bright" />
        </div>
        <h1 className="mt-4 font-display text-xl font-semibold text-ink">
          {copy.lockTitle}
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">{copy.lockHint}</p>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={copy.lockPlaceholder}
          className="mt-5 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-center text-sm text-ink outline-none focus:border-line-strong"
        />
        {failed && (
          <p className="mt-2 text-[12px] text-strain">{copy.lockError}</p>
        )}
        <button
          type="submit"
          className="panel-hover mt-4 w-full rounded-lg bg-elevated py-2.5 text-sm font-medium text-solar-bright"
        >
          {copy.lockButton}
        </button>
      </form>
    </div>
  )
}
