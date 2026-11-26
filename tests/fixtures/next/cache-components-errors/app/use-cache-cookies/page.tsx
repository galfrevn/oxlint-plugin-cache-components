import { cookies } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses `cookies()` in `'use cache'`, which triggers an
        error.
      </p>
      <CookiesReadingComponent />
    </>
  )
}

async function CookiesReadingComponent() {
  'use cache'

  try {
    await cookies()
  } catch {}

  return null
}
