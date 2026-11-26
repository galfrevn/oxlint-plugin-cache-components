import { connection } from 'next/server'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `connection()` in `'use cache'`, which triggers an
        error.
      </p>
      <ConnectionCallingComponent />
    </>
  )
}

async function ConnectionCallingComponent() {
  'use cache'

  try {
    await connection()
  } catch {}

  return null
}
