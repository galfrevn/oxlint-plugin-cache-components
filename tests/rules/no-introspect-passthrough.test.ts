import { noIntrospectPassthrough } from "../../src/rules/no-introspect-passthrough.ts";
import { createTester } from "../helpers/tester.ts";

const URL = "https://nextjs.org/docs/app/api-reference/directives/use-cache";

createTester().run("cache-components/no-introspect-passthrough", noIntrospectPassthrough, {
  valid: [
    {
      name: "children and functions passed through",
      code: `
async function Layout({ children, action }: Props) {
  "use cache";
  return <form action={action}>{children}</form>;
}`,
    },
    {
      name: "a module-level function called inside",
      code: `
function format(value: string) { return value.trim(); }
async function Title({ text }: { text: string }) {
  "use cache";
  return <h1>{format(text)}</h1>;
}`,
    },
    {
      name: "an uncached component that reads children",
      code: `
import { Children } from "react";
function List({ children }: { children: React.ReactNode }) {
  return <ul data-count={Children.count(children)}>{children}</ul>;
}`,
    },
    {
      name: "children of a function that is not a component",
      code: `
async function count({ children }) {
  "use cache";
  return children.map((child) => child.id).length;
}`,
    },
    {
      name: "children annotated as data",
      code: `
async function Tree({ children }: { children: Node[] }) {
  "use cache";
  return <ul>{children.map((node) => <li key={node.id}>{node.name}</li>)}</ul>;
}`,
    },
    {
      name: "methods of serializable arguments",
      code: `
async function getSummary(date: Date, filters: Map<string, string>) {
  "use cache";
  return \`\${date.getUTCFullYear()} \${filters.get("sort")}\`;
}`,
    },
    {
      name: "a data prop that is not a slot",
      code: `
async function Rows({ items }: { items: string[] }) {
  "use cache";
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}`,
    },
  ],
  invalid: [
    {
      name: "Children.count on children",
      code: `
import { Children, type ReactNode } from "react";
async function Card({ children }: { children: ReactNode }) {
  "use cache";
  const count = Children.count(children);
  return <div data-count={count}>{children}</div>;
}`,
      errors: [
        {
          message: `\`children\` is passed into "use cache" as a reference. Pass it through without reading or transforming it; introspecting it inside a cached function isn't supported. See ${URL}`,
          line: 5,
        },
      ],
    },
    {
      name: "reading props of children and of a slot prop",
      code: `
async function Card({ children, icon }: { children: ReactNode; icon: ReactElement }) {
  "use cache";
  return <div title={String(children.props.id)}>{icon.type}{children}</div>;
}`,
      errors: [
        {
          messageId: "introspectChildren",
          data: { name: "children", scope: '"use cache"', fn: "Card" },
        },
        {
          messageId: "introspectChildren",
          data: { name: "icon", scope: '"use cache"', fn: "Card" },
        },
      ],
    },
    {
      name: "cloneElement, isValidElement, typeof, and Array.isArray",
      code: `
import { cloneElement } from "react";
async function Wrap({ children }: { children: React.ReactNode }) {
  "use cache";
  if (Array.isArray(children)) return null;
  return cloneElement(children);
}`,
      errors: [{ messageId: "introspectChildren", line: 5 }],
    },
    {
      name: "a slot in a union type and unannotated children",
      code: `
async function Panel({ header, children }: { header: ReactNode | string; children?: unknown }) {
  "use cache";
  return <div>{header.props.title}{children}</div>;
}
async function Plain({ children }) {
  "use cache";
  return <div>{children.type}</div>;
}`,
      errors: [
        {
          messageId: "introspectChildren",
          data: { name: "header", scope: '"use cache"', fn: "Panel" },
        },
        {
          messageId: "introspectChildren",
          data: { name: "children", scope: '"use cache"', fn: "Plain" },
        },
      ],
    },
    {
      name: "props.children read through the props object",
      code: `
async function Card(props: { children: React.ReactNode }) {
  "use cache: remote";
  return <div>{typeof props.children}</div>;
}`,
      errors: [
        {
          messageId: "introspectChildren",
          data: { name: "props.children", scope: '"use cache: remote"', fn: "Card" },
        },
      ],
    },
    {
      name: "calling a function passed as an argument",
      code: `
async function Shell({ onLoad }: { onLoad: () => void }) {
  "use cache";
  onLoad();
  return <main />;
}`,
      errors: [
        {
          message: `\`onLoad\` is a function passed into "use cache" \`Shell\`. Functions can be passed through a cached function but not called inside it, and Next.js throws "Attempted to call a temporary Client Reference from the server". Call it outside, or pass its result as data. See ${URL}`,
        },
      ],
    },
    {
      name: "calling a function parameter and a props member",
      code: `
async function run(transform: (value: number) => number, props: { done: () => void }) {
  "use cache";
  const value = transform(1);
  return value;
}
async function Page(props: { onDone: () => void }) {
  "use cache: private";
  await props.onDone();
  return <main />;
}`,
      errors: [
        {
          messageId: "callFunctionArg",
          data: { name: "transform", scope: '"use cache"', fn: "run" },
        },
        {
          messageId: "callFunctionArg",
          data: { name: "props.onDone", scope: '"use cache: private"', fn: "Page" },
        },
      ],
    },
  ],
});
