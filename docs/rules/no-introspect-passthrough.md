# `cache-components/no-introspect-passthrough`

Disallow reading `children` or calling a function received as an argument inside a cached function.

**Preset:** `strict` (warn) · **Type:** problem · **Fix:** no · **Suggestions:** no

## Rule details

A cached function can receive values it cannot serialize, such as `children` or a function, as long as it only passes them through. Next.js replaces them with temporary references, so the cached output can be reused with other children. Reading or calling one of those references inside the cached function fails during prerendering. Next.js 16.4.6 reports:

```text
Error: Cannot access props on the server. You cannot dot into a temporary client reference from a server component. You can only pass the value through to the client.
```

```text
Error: Attempted to call a temporary Client Reference from the server but it is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.
```

Inside a `"use cache"`, `"use cache: remote"`, `"use cache: private"`, or `"use cache: <handler>"` function, the rule reports:

- A call to a parameter, a destructured prop, or a `props` member, such as `onLoad()` or `props.format()`.
- Introspection of `children` in a component (a function whose name starts with an uppercase letter), or of a prop annotated as `ReactNode`, `ReactElement`, or `JSX.Element`: `.props`, `.type`, `.map()`, `typeof`, `Children.*()`, `cloneElement()`, `isValidElement()`, and `Array.isArray()`.

`Children.count()` and the other `Children` helpers don't throw, but they don't see the children you passed. In Next.js 16.4.6, `Children.count()` returned `0` for three children inside `"use cache"`.

## Examples

Invalid:

```tsx
async function Card({ children }: { children: ReactNode }) {
  "use cache";
  return <section title={children.props.id}>{children}</section>;
}
```

```tsx
async function Shell({ format }: { format: (value: string) => string }) {
  "use cache";
  return <p>{format("shell")}</p>;
}
```

Valid:

```tsx
async function Frame({ children, action }: Props) {
  "use cache";
  return <form action={action}>{children}</form>;
}
```

## Limitations

- Types are read from the annotation in the parameter only. A prop typed through an interface or a type alias counts as a slot only when it is named `children`.
- Values that reach the cached function through a variable, not a parameter, are not followed.

## Related

- Next.js: [`"use cache"`, Non-serializable arguments](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [`serializable-cache-args`](serializable-cache-args.md)
