import { draftMode } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page enables draft mode in `'use cache'`, which triggers an error.
      </p>
      <DraftModeEnablingComponent />
    </>
  )
}

async function DraftModeEnablingComponent() {
  'use cache'

  try {
    ;(await draftMode()).enable()
  } catch {}

  return null
}
