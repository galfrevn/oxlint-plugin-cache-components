import { connection } from 'next/server'
import { Suspense } from 'react'

export default async function Page() {
  return (
    <>
      <p>
        This page uses `connection()` inside `'use cache: private'`, which
        triggers an error at runtime.
      </p>
      <Suspense fallback={<p>Loading...</p>}>
        <Private />
      </Suspense>
    </>
  )
}

async function Private() {
  'use cache: private'

  await new Promise((resolve) => setTimeout(resolve))

  try {
    await connection()
  } catch {}

  return <p id="private">Private</p>
}
