import { headers } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses `headers()` in `'use cache'`, which triggers an
        error.
      </p>
      <HeadersReadingComponent />
    </>
  )
}

async function HeadersReadingComponent() {
  'use cache'

  try {
    await headers()
  } catch {}

  return null
}
